import { io } from 'socket.io-client';

const SERVER_URL = 'https://chat-app-server-6bjp.onrender.com';

export const socket = io(SERVER_URL, {
  autoConnect: false,
});