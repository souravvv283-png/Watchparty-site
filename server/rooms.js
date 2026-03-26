/**
 * rooms.js — In-memory room store
 *
 * Each room tracks:
 *   roomId     : string (8-char uppercase)
 *   hostId     : socket.id of the current host
 *   users      : [{ id, name, isReady }]
 *   videoId    : YouTube video ID (null if not set)
 *   currentTime: playback position in seconds
 *   isPlaying  : boolean
 *   lastUpdate : timestamp of last state change
 */

const rooms = new Map();

/** Create a brand-new room and return it */
function createRoom(roomId, hostSocketId, hostName) {
  const room = {
    roomId,
    hostId: hostSocketId,
    users: [{ id: hostSocketId, name: hostName, isReady: false }],
    videoId: null,
    currentTime: 0,
    isPlaying: false,
    lastUpdate: Date.now(),
  };
  rooms.set(roomId, room);
  return room;
}

/** Get a room by ID (or null if missing) */
function getRoom(roomId) {
  return rooms.get(roomId) || null;
}

/** Add a user to an existing room */
function joinRoom(roomId, userId, userName) {
  const room = rooms.get(roomId);
  if (!room) return null;

  // Remove stale entry if reconnecting with same id
  room.users = room.users.filter((u) => u.id !== userId);
  room.users.push({ id: userId, name: userName, isReady: false });
  return room;
}

/**
 * Remove a user from a room.
 * If the host leaves, ownership passes to the next user.
 * If the room is now empty it is deleted and null is returned.
 */
function leaveRoom(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) return null;

  room.users = room.users.filter((u) => u.id !== userId);

  if (room.users.length === 0) {
    rooms.delete(roomId);
    return null;
  }

  // Promote the first remaining user to host
  if (room.hostId === userId) {
    room.hostId = room.users[0].id;
  }

  return room;
}

/** Change the active video (resets playback state) */
function updateRoomVideo(roomId, videoId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  room.videoId = videoId;
  room.currentTime = 0;
  room.isPlaying = false;
  room.lastUpdate = Date.now();
  return room;
}

/** Update playback state (time + playing flag) */
function updateRoomState(roomId, { currentTime, isPlaying }) {
  const room = rooms.get(roomId);
  if (!room) return null;
  if (currentTime !== undefined) room.currentTime = currentTime;
  if (isPlaying !== undefined) room.isPlaying = isPlaying;
  room.lastUpdate = Date.now();
  return room;
}

/** Mark a user ready/not-ready */
function setUserReady(roomId, userId, isReady) {
  const room = rooms.get(roomId);
  if (!room) return null;
  const user = room.users.find((u) => u.id === userId);
  if (user) user.isReady = isReady;
  return room;
}

module.exports = {
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  updateRoomVideo,
  updateRoomState,
  setUserReady,
};
