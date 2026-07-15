import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import {
  ClientEvents,
  RoomJoinPayload,
  ServerEvents,
  TypingPayload,
  rooms,
} from '@inmobiles/shared-types';
import { AuthService } from '../modules/auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RealtimeService } from './realtime.service';

const PRESENCE_TTL_SECONDS = 60;
const PRESENCE_REFRESH_MS = 25_000;
const TYPING_TTL_MS = 6_000;

interface AuthedSocket extends Socket {
  data: { userId: string; displayName: string };
}

@WebSocketGateway({ path: '/socket.io' })
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChatGateway.name);
  private readonly presenceTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Server) {
    this.realtime.bind(server);
    // Reject unauthenticated sockets before the connection completes.
    server.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token as string | undefined;
        if (!token) return next(new Error('unauthorized'));
        const payload = await this.auth.verifyAccessToken(token);
        const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
        if (!user || user.deletedAt) return next(new Error('unauthorized'));
        (socket as AuthedSocket).data = { userId: user.id, displayName: user.displayName };
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });
  }

  async handleConnection(socket: AuthedSocket) {
    const { userId } = socket.data;
    await socket.join(rooms.user(userId));

    const memberships = await this.prisma.workspaceMember.findMany({ where: { userId } });
    for (const m of memberships) await socket.join(rooms.workspace(m.workspaceId));

    const presenceKey = `presence:online:${userId}`;
    const wasOffline = (await this.redis.client.exists(presenceKey)) === 0;
    await this.redis.client.set(presenceKey, '1', 'EX', PRESENCE_TTL_SECONDS);

    const timer = setInterval(() => {
      this.redis.client.set(presenceKey, '1', 'EX', PRESENCE_TTL_SECONDS).catch(() => undefined);
    }, PRESENCE_REFRESH_MS);
    this.presenceTimers.set(socket.id, timer);

    if (wasOffline) {
      for (const m of memberships) {
        this.realtime.toWorkspace(m.workspaceId, ServerEvents.PresenceUpdate, {
          userId,
          status: 'online',
        });
      }
    }
  }

  async handleDisconnect(socket: AuthedSocket) {
    const timer = this.presenceTimers.get(socket.id);
    if (timer) clearInterval(timer);
    this.presenceTimers.delete(socket.id);

    const { userId } = socket.data;
    if (!userId) return;

    // Only flip to offline when the user's last socket (across all nodes) is gone.
    const remaining = await this.server.in(rooms.user(userId)).fetchSockets();
    if (remaining.length === 0) {
      await this.redis.client.del(`presence:online:${userId}`);
      const memberships = await this.prisma.workspaceMember.findMany({ where: { userId } });
      for (const m of memberships) {
        this.realtime.toWorkspace(m.workspaceId, ServerEvents.PresenceUpdate, {
          userId,
          status: 'offline',
        });
      }
    }
  }

  @SubscribeMessage(ClientEvents.RoomJoin)
  async onRoomJoin(socket: AuthedSocket, raw: unknown) {
    const parsed = RoomJoinPayload.safeParse(raw);
    if (!parsed.success) return;
    const { channelId } = parsed.data;
    // Room membership IS authorization — verify against channel_members.
    const member = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId: socket.data.userId } },
    });
    if (!member) return;
    await socket.join(rooms.channel(channelId));
  }

  @SubscribeMessage(ClientEvents.RoomLeave)
  async onRoomLeave(socket: AuthedSocket, raw: unknown) {
    const parsed = RoomJoinPayload.safeParse(raw);
    if (!parsed.success) return;
    await socket.leave(rooms.channel(parsed.data.channelId));
  }

  @SubscribeMessage(ClientEvents.TypingStart)
  async onTypingStart(socket: AuthedSocket, raw: unknown) {
    const parsed = TypingPayload.safeParse(raw);
    if (!parsed.success) return;
    await this.updateTyping(parsed.data.channelId, socket.data, true);
  }

  @SubscribeMessage(ClientEvents.TypingStop)
  async onTypingStop(socket: AuthedSocket, raw: unknown) {
    const parsed = TypingPayload.safeParse(raw);
    if (!parsed.success) return;
    await this.updateTyping(parsed.data.channelId, socket.data, false);
  }

  /**
   * Typing state lives in a Redis hash per channel: field = userId, value =
   * JSON { displayName, expiresAt }. Expired fields are pruned on every
   * update; clients additionally expire entries locally after 6s.
   */
  private async updateTyping(
    channelId: string,
    user: { userId: string; displayName: string },
    typing: boolean,
  ) {
    const key = `typing:${channelId}`;
    if (typing) {
      await this.redis.client.hset(
        key,
        user.userId,
        JSON.stringify({ displayName: user.displayName, expiresAt: Date.now() + TYPING_TTL_MS }),
      );
      await this.redis.client.expire(key, 30);
    } else {
      await this.redis.client.hdel(key, user.userId);
    }

    const entries = await this.redis.client.hgetall(key);
    const now = Date.now();
    const users: { id: string; displayName: string }[] = [];
    for (const [id, value] of Object.entries(entries)) {
      try {
        const data = JSON.parse(value) as { displayName: string; expiresAt: number };
        if (data.expiresAt > now) users.push({ id, displayName: data.displayName });
        else await this.redis.client.hdel(key, id);
      } catch {
        await this.redis.client.hdel(key, id);
      }
    }
    this.realtime.toChannel(channelId, ServerEvents.TypingUpdate, { channelId, users });
  }
}
