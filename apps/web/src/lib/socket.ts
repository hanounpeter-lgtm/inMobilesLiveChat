import { io, type Socket } from 'socket.io-client';
import { getAccessToken, tryRefresh } from './api';

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  if (socket) return socket;
  socket = io('/', {
    path: '/socket.io',
    transports: ['websocket'],
    auth: (cb) => cb({ token: getAccessToken() ?? token }),
  });
  // Expired token at reconnect time → refresh, then socket.io retries with
  // the new token via the auth callback above.
  socket.on('connect_error', async (err) => {
    if (err.message === 'unauthorized') await tryRefresh();
  });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
