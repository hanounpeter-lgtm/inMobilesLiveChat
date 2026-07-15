import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import { rooms, ServerEvents, type ServerEventName } from '@inmobiles/shared-types';

/**
 * The only place that touches the raw Socket.IO server. Domain services emit
 * through this wrapper so broadcasts always go through the Redis adapter and
 * room conventions stay in one file.
 */
@Injectable()
export class RealtimeService {
  private server?: Server;

  bind(server: Server) {
    this.server = server;
  }

  toChannel(channelId: string, event: ServerEventName, payload: unknown) {
    this.server?.to(rooms.channel(channelId)).emit(event, payload);
  }

  toUser(userId: string, event: ServerEventName, payload: unknown) {
    this.server?.to(rooms.user(userId)).emit(event, payload);
  }

  toWorkspace(workspaceId: string, event: ServerEventName, payload: unknown) {
    this.server?.to(rooms.workspace(workspaceId)).emit(event, payload);
  }

  /** Pull all of a user's sockets out of a channel room (cross-node via Redis adapter). */
  evictFromChannel(userId: string, channelId: string) {
    this.server?.in(rooms.user(userId)).socketsLeave(rooms.channel(channelId));
  }

  async disconnectUser(userId: string) {
    if (!this.server) return;
    const sockets = await this.server.in(rooms.user(userId)).fetchSockets();
    for (const socket of sockets) socket.disconnect(true);
  }

  events = ServerEvents;
}
