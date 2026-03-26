/**
 * server/index.js
 * Watch Party backend — Express REST + Socket.io realtime
 *
 * In production:  serves the React build from /public as static files.
 *                 All unknown routes return index.html (SPA fallback).
 * In development: Vite dev server runs separately on port 5173.
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

// ─── App setup ────────────────────────────────────────────────────────────────

const app  = express();
const isProd = process.env.NODE_ENV === 'production';

// In production the React build lives in server/public (built by Vite)
if (isProd) {
  app.use(express.static(path.join(__dirname, 'public')));
}

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ─── REST endpoints ───────────────────────────────────────────────────────────

app.post('/api/rooms', (req, res) => {
  const { userName } = req.body;
  if (!userName || !userName.trim()) {
    return res.status(400).json({ error: 'userName is required' });
  }
  const roomId = uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase();
  res.json({ roomId });
});

app.get('/api/rooms/:roomId', (req, res) => {
  const room = getRoom(req.params.roomId.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({ exists: true, userCount: room.users.length });
});

// ─── SPA fallback (production only) ──────────────────────────────────────────
// Must come AFTER API routes so /api/* is not caught here
if (isProd) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

// ─── Socket.io ────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[socket] connected  ${socket.id}`);

  // ── join-room ──────────────────────────────────────────────────────────────
  socket.on('join-room', ({ roomId, userName }) => {
    if (!roomId || !userName) return;
    roomId   = roomId.trim().toUpperCase();
    userName = userName.trim();

    let room = getRoom(roomId);
    const isNewRoom = !room;

    if (isNewRoom) {
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

    console.log(`[room] ${userName} joined ${roomId} (host: ${room.hostId === socket.id})`);
  });

  // ── set-video ──────────────────────────────────────────────────────────────
  socket.on('set-video', ({ roomId, videoId }) => {
    if (!roomId || !videoId) return;
    roomId = roomId.toUpperCase();
    const room = getRoom(roomId);
    if (!room || room.hostId !== socket.id) return;
    updateRoomVideo(roomId, videoId);
    io.to(roomId).emit('video-changed', { videoId });
  });

  // ── playback events ────────────────────────────────────────────────────────
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

  // ── WebRTC Screen Share Signaling ──────────────────────────────────────────
  socket.on('screen-share-start', ({ roomId }) => {
    if (!roomId) return;
    roomId = roomId.toUpperCase();
    const room = getRoom(roomId);
    if (!room || room.hostId !== socket.id) return;
    room.isScreenSharing = true;
    socket.to(roomId).emit('screen-share-start', { hostId: socket.id });
  });

  socket.on('screen-share-offer', ({ roomId, offer, targetId }) => {
    io.to(targetId).emit('screen-share-offer', { offer, hostId: socket.id });
  });

  socket.on('screen-share-answer', ({ roomId, answer, hostId }) => {
    io.to(hostId).emit('screen-share-answer', { answer, viewerId: socket.id });
  });

  socket.on('screen-share-ready', ({ roomId, hostId }) => {
    io.to(hostId).emit('screen-share-ready', { viewerId: socket.id });
  });

  socket.on('ice-candidate', ({ targetId, candidate }) => {
    io.to(targetId).emit('ice-candidate', { candidate, fromId: socket.id });
  });

  socket.on('screen-share-stop', ({ roomId }) => {
    if (!roomId) return;
    roomId = roomId.toUpperCase();
    const room = getRoom(roomId);
    if (!room) return;
    room.isScreenSharing = false;
    socket.to(roomId).emit('screen-share-stop');
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
        userId:    socket.id,
        userName,
        users:     room.users,
        newHostId: room.hostId,
      });
    }
    console.log(`[socket] disconnected  ${socket.id}  (${userName} left ${roomId})`);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🎬  Watch Party server running on http://localhost:${PORT}`);
  console.log(`    Mode: ${isProd ? 'production (serving React build)' : 'development'}\n`);
});
