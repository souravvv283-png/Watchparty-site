/**
 * server/index.js
 * Watch Party — Express REST + Socket.io
 *
 * Production: serves React build from /public as static files + SPA fallback.
 * Development: Vite dev server runs separately on port 5173.
 */
 
const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const cors     = require('cors');
const path     = require('path');
const { v4: uuidv4 } = require('uuid');
 
const {
  createRoom, getRoom, joinRoom, leaveRoom,
  updateRoomVideo, updateRoomState, setUserReady,
} = require('./rooms');
 
const app    = express();
const isProd = process.env.NODE_ENV === 'production';
 
if (isProd) {
  app.use(express.static(path.join(__dirname, 'public')));
}
 
app.use(cors());
app.use(express.json());
 
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});
 
// ── REST ──────────────────────────────────────────────────────────────────────
 
app.post('/api/rooms', (req, res) => {
  const { userName } = req.body;
  if (!userName?.trim()) return res.status(400).json({ error: 'userName is required' });
  const roomId = uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase();
  res.json({ roomId });
});
 
app.get('/api/rooms/:roomId', (req, res) => {
  const room = getRoom(req.params.roomId.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({ exists: true, userCount: room.users.length });
});
 
if (isProd) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}
 
// ── Socket.io ─────────────────────────────────────────────────────────────────
 
io.on('connection', (socket) => {
  console.log(`[+] ${socket.id}`);
 
  // ── join-room ──────────────────────────────────────────────────────────────
  socket.on('join-room', ({ roomId, userName }) => {
    if (!roomId || !userName) return;
    roomId   = roomId.trim().toUpperCase();
    userName = userName.trim();
 
    let room = getRoom(roomId);
    const isNew = !room;
 
    if (isNew) {
      room = createRoom(roomId, socket.id, userName);
    } else {
      room = joinRoom(roomId, socket.id, userName);
      if (!room) { socket.emit('error-msg', { message: 'Room not found' }); return; }
    }
 
    socket.join(roomId);
    socket.data.roomId   = roomId;
    socket.data.userName = userName;
 
    socket.emit('room-joined', {
      roomId,
      isHost:      room.hostId === socket.id,
      hostId:      room.hostId,
      users:       room.users,
      videoId:     room.videoId,
      currentTime: room.currentTime,
      isPlaying:   room.isPlaying,
    });
 
    socket.to(roomId).emit('user-joined', {
      user:  { id: socket.id, name: userName, isReady: false },
      users: room.users,
    });
 
    console.log(`[room] ${userName} → ${roomId}`);
  });
 
  // ── video ──────────────────────────────────────────────────────────────────
  socket.on('set-video', ({ roomId, videoId }) => {
    if (!roomId || !videoId) return;
    roomId = roomId.toUpperCase();
    const room = getRoom(roomId);
    if (!room || room.hostId !== socket.id) return;
    updateRoomVideo(roomId, videoId);
    io.to(roomId).emit('video-changed', { videoId });
  });
 
  // ── playback ───────────────────────────────────────────────────────────────
  socket.on('play', ({ roomId, currentTime }) => {
    roomId = roomId.toUpperCase();
    const room = getRoom(roomId);
    if (!room || room.hostId !== socket.id) return;
    updateRoomState(roomId, { currentTime, isPlaying: true });
    socket.to(roomId).emit('play', { currentTime });
  });
 
  socket.on('pause', ({ roomId, currentTime }) => {
    roomId = roomId.toUpperCase();
    const room = getRoom(roomId);
    if (!room || room.hostId !== socket.id) return;
    updateRoomState(roomId, { currentTime, isPlaying: false });
    socket.to(roomId).emit('pause', { currentTime });
  });
 
  socket.on('seek', ({ roomId, currentTime }) => {
    roomId = roomId.toUpperCase();
    const room = getRoom(roomId);
    if (!room || room.hostId !== socket.id) return;
    updateRoomState(roomId, { currentTime });
    socket.to(roomId).emit('seek', { currentTime });
  });
 
  socket.on('sync', ({ roomId, currentTime, isPlaying }) => {
    roomId = roomId.toUpperCase();
    const room = getRoom(roomId);
    if (!room || room.hostId !== socket.id) return;
    updateRoomState(roomId, { currentTime, isPlaying });
    socket.to(roomId).emit('sync', { currentTime, isPlaying });
  });
 
  // ── Screen Share Signaling ─────────────────────────────────────────────────
  // ANYONE can share — not just the host
 
  socket.on('screen-share-start', ({ roomId }) => {
    if (!roomId) return;
    roomId = roomId.toUpperCase();
    const room = getRoom(roomId);
    if (!room) return;
    room.isScreenSharing = true;
    room.sharerId = socket.id;
    const sharer = room.users.find((u) => u.id === socket.id);
    socket.to(roomId).emit('screen-share-start', {
      sharerId:   socket.id,
      sharerName: sharer?.name || 'Someone',
    });
    console.log(`[screen] ${sharer?.name} sharing in ${roomId}`);
  });
 
  socket.on('screen-share-offer', ({ roomId, offer, targetId }) => {
    io.to(targetId).emit('screen-share-offer', { offer, sharerId: socket.id });
  });
 
  socket.on('screen-share-answer', ({ roomId, answer, sharerId }) => {
    io.to(sharerId).emit('screen-share-answer', { answer, viewerId: socket.id });
  });
 
  socket.on('screen-share-ready', ({ roomId, sharerId }) => {
    io.to(sharerId).emit('screen-share-ready', { viewerId: socket.id });
  });
 
  socket.on('ice-candidate', ({ targetId, candidate }) => {
    io.to(targetId).emit('ice-candidate', { candidate, fromId: socket.id });
  });
 
  socket.on('screen-share-stop', ({ roomId }) => {
    if (!roomId) return;
    roomId = roomId.toUpperCase();
    const room = getRoom(roomId);
    if (!room || room.sharerId !== socket.id) return;
    room.isScreenSharing = false;
    room.sharerId = null;
    socket.to(roomId).emit('screen-share-stop');
    console.log(`[screen] stopped in ${roomId}`);
  });
 
  // ── chat ───────────────────────────────────────────────────────────────────
  socket.on('chat-message', ({ roomId, message }) => {
    if (!roomId || !message?.trim()) return;
    roomId = roomId.toUpperCase();
    const room = getRoom(roomId);
    if (!room) return;
    const sender = room.users.find((u) => u.id === socket.id);
    if (!sender) return;
    io.to(roomId).emit('chat-message', {
      id:        uuidv4(),
      userId:    socket.id,
      userName:  sender.name,
      message:   message.trim().slice(0, 500),
      timestamp: Date.now(),
    });
  });
 
  // ── ready ──────────────────────────────────────────────────────────────────
  socket.on('toggle-ready', ({ roomId, isReady }) => {
    if (!roomId) return;
    roomId = roomId.toUpperCase();
    const room = setUserReady(roomId, socket.id, isReady);
    if (!room) return;
    io.to(roomId).emit('users-updated', { users: room.users });
  });
 
  // ── disconnect ─────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const { roomId, userName } = socket.data;
    if (!roomId) return;
    const room = leaveRoom(roomId, socket.id);
    if (room) {
      io.to(roomId).emit('user-left', {
        userId: socket.id, userName, users: room.users, newHostId: room.hostId,
      });
    }
    console.log(`[-] ${socket.id} (${userName} left ${roomId})`);
  });
});
 
// ── Start ─────────────────────────────────────────────────────────────────────
 
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🎬  Watch Party on http://localhost:${PORT}  [${isProd ? 'production' : 'development'}]\n`);
});
