/**
 * socket.js
 * In production:  connects to the same origin (Express serves everything)
 * In development: connects to localhost:3001 (separate Express process)
 */
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.DEV
  ? 'http://localhost:3001'   // dev: Vite on :5173, Express on :3001
  : window.location.origin;   // prod: same domain serves both

const socket = io(SERVER_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
});

export default socket;
