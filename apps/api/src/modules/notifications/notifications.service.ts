import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { NotificationDto, UnreadState } from '@inmobiles/shared-types';
import { ServerEvents, hasChannelMention, parseMentionIds } from '@inmobiles/shared-types';
import type { Channel, Message } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../gateway/realtime.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Inline membership check — avoids a Channels↔Notifications module cycle. */
  private async requireMembership(channelId: string, userId: string) {
    const member = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!member) throw new ForbiddenException('Not a member of this channel');
    return member;
  }

  /** Per-channel unread state for the sidebar — two queries total. */
  async getUnreads(userId: string): Promise<UnreadState[]> {
    const members = await this.prisma.channelMember.findMany({
      where: { userId },
      select: {
        channelId: true,
        lastReadAt: true,
        lastReadMessageId: true,
        channel: { select: { lastMessageAt: true } },
      },
    });
    const counts = await this.prisma.notification.groupBy({
      by: ['channelId'],
      where: { userId, readAt: null, channelId: { not: null } },
      _count: { _all: true },
    });
    const countByChannel = new Map(counts.map((c) => [c.channelId, c._count._all]));

    return members.map((m) => ({
      channelId: m.channelId,
      lastReadAt: m.lastReadAt?.toISOString() ?? null,
      lastReadMessageId: m.lastReadMessageId,
      hasUnread:
        m.channel.lastMessageAt !== null &&
        (m.lastReadAt === null || m.channel.lastMessageAt > m.lastReadAt),
      mentionCount: countByChannel.get(m.channelId) ?? 0,
    }));
  }

  private async computeState(channelId: string, userId: string): Promise<UnreadState> {
    const member = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
      select: {
        lastReadAt: true,
        lastReadMessageId: true,
        channel: { select: { lastMessageAt: true } },
      },
    });
    const mentionCount = await this.prisma.notification.count({
      where: { userId, channelId, readAt: null },
    });
    return {
      channelId,
      lastReadAt: member?.lastReadAt?.toISOString() ?? null,
      lastReadMessageId: member?.lastReadMessageId ?? null,
      hasUnread:
        !!member?.channel.lastMessageAt &&
        (member.lastReadAt === null || member.channel.lastMessageAt > member.lastReadAt),
      mentionCount,
    };
  }

  private emitState(userId: string, state: UnreadState) {
    this.realtime.toUser(userId, ServerEvents.UnreadUpdate, state);
  }

  /**
   * Mark a channel read up to a message (or its latest). Advance-only, so
   * out-of-order debounced requests are harmless.
   */
  async markRead(channelId: string, userId: string, messageId?: string): Promise<UnreadState> {
    await this.requireMembership(channelId, userId);

    let markerAt: Date;
    let markerMessageId: string | null = null;
    if (messageId) {
      const message = await this.prisma.message.findUnique({ where: { id: messageId } });
      if (!message || message.channelId !== channelId) {
        throw new BadRequestException('Message does not belong to this channel');
      }
      markerAt = message.createdAt;
      markerMessageId = message.id;
    } else {
      const channel = await this.prisma.channel.findUniqueOrThrow({
        where: { id: channelId },
        select: { lastMessageAt: true },
      });
      markerAt = channel.lastMessageAt ?? new Date();
    }

    await this.prisma.channelMember.updateMany({
      where: {
        channelId,
        userId,
        OR: [{ lastReadAt: null }, { lastReadAt: { lt: markerAt } }],
      },
      data: { lastReadAt: markerAt, lastReadMessageId: markerMessageId },
    });
    // Mentions that arrived after the marker stay badged.
    await this.prisma.notification.updateMany({
      where: { userId, channelId, readAt: null, createdAt: { lte: markerAt } },
      data: { readAt: new Date() },
    });

    // Broadcast a read receipt to the channel so others can render "seen".
    this.realtime.toChannel(channelId, ServerEvents.ChannelRead, {
      channelId,
      userId,
      lastReadMessageId: markerMessageId,
      lastReadAt: markerAt.toISOString(),
    });

    const state = await this.computeState(channelId, userId);
    this.emitState(userId, state);
    return state;
  }

  /** Read pointers for every member of a channel — powers read receipts. */
  async listReceipts(channelId: string, userId: string) {
    await this.requireMembership(channelId, userId);
    const members = await this.prisma.channelMember.findMany({
      where: { channelId },
      select: {
        userId: true,
        lastReadMessageId: true,
        lastReadAt: true,
        user: { select: { displayName: true, avatarUrl: true } },
      },
    });
    return members.map((m) => ({
      userId: m.userId,
      displayName: m.user.displayName,
      avatarUrl: m.user.avatarUrl,
      lastReadMessageId: m.lastReadMessageId,
      lastReadAt: m.lastReadAt?.toISOString() ?? null,
    }));
  }

  /**
   * Called by MessagesService after a message is persisted (post-idempotency
   * check, so retries never double-notify). Inserts mention/dm notifications
   * and pushes badge updates — bounded query count regardless of fan-out size.
   */
  async fanOutForMessage(message: Message, channel: Channel, authorId: string) {
    const mentionIds = parseMentionIds(message.content);
    const channelWide = hasChannelMention(message.content);
    const isDm = channel.type === 'dm' || channel.type === 'group_dm';
    if (mentionIds.length === 0 && !channelWide && !isDm) return;

    const members = await this.prisma.channelMember.findMany({
      where: { channelId: message.channelId },
      select: { userId: true },
    });
    const memberIds = new Set(members.map((m) => m.userId));

    const mentionRecipients = new Set<string>();
    if (channelWide) {
      for (const id of memberIds) if (id !== authorId) mentionRecipients.add(id);
    } else {
      for (const id of mentionIds) {
        if (id !== authorId && memberIds.has(id)) mentionRecipients.add(id);
      }
    }
    const dmRecipients = new Set<string>();
    if (isDm) {
      for (const id of memberIds) {
        if (id !== authorId && !mentionRecipients.has(id)) dmRecipients.add(id);
      }
    }
    const all = [...mentionRecipients, ...dmRecipients];
    if (all.length === 0) return;

    await this.prisma.notification.createMany({
      data: all.map((userId) => ({
        userId,
        workspaceId: channel.workspaceId,
        type: mentionRecipients.has(userId) ? ('mention' as const) : ('dm' as const),
        messageId: message.id,
        channelId: message.channelId,
        actorId: authorId,
        // Stamp with the MESSAGE's time — mark-read clears notifications up to
        // the read marker, which is a message timestamp. Insert-time stamps
        // would land milliseconds later and survive the clear.
        createdAt: message.createdAt,
      })),
    });

    const author = await this.prisma.user.findUniqueOrThrow({
      where: { id: authorId },
      select: { id: true, displayName: true, avatarUrl: true },
    });
    const counts = await this.prisma.notification.groupBy({
      by: ['userId'],
      where: { userId: { in: all }, channelId: message.channelId, readAt: null },
      _count: { _all: true },
    });
    const countByUser = new Map(counts.map((c) => [c.userId, c._count._all]));
    const memberRows = await this.prisma.channelMember.findMany({
      where: { channelId: message.channelId, userId: { in: all } },
      select: { userId: true, lastReadAt: true, lastReadMessageId: true },
    });
    const rowByUser = new Map(memberRows.map((r) => [r.userId, r]));

    const snippet = message.content.slice(0, 140);
    for (const userId of all) {
      const row = rowByUser.get(userId);
      this.realtime.toUser(userId, ServerEvents.NotificationNew, {
        notification: {
          id: message.id, // provisional id for live toast purposes; feed refetches real rows
          type: mentionRecipients.has(userId) ? 'mention' : 'dm',
          channelId: message.channelId,
          messageId: message.id,
          actor: author,
          snippet,
          readAt: null,
          createdAt: message.createdAt.toISOString(),
        } satisfies NotificationDto,
      });
      this.emitState(userId, {
        channelId: message.channelId,
        lastReadAt: row?.lastReadAt?.toISOString() ?? null,
        lastReadMessageId: row?.lastReadMessageId ?? null,
        hasUnread: true,
        mentionCount: countByUser.get(userId) ?? 0,
      });
    }
  }

  /** Activity feed — two queries (rows + message snippets). */
  async listMine(userId: string): Promise<NotificationDto[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { actor: { select: { id: true, displayName: true, avatarUrl: true } } },
    });
    const messageIds = rows.map((r) => r.messageId).filter((id): id is string => !!id);
    const messages = await this.prisma.message.findMany({
      where: { id: { in: messageIds } },
      select: { id: true, content: true, deletedAt: true },
    });
    const byId = new Map(messages.map((m) => [m.id, m]));
    return rows.map((r) => {
      const msg = r.messageId ? byId.get(r.messageId) : undefined;
      return {
        id: r.id,
        type: r.type,
        channelId: r.channelId,
        messageId: r.messageId,
        actor: r.actor,
        snippet: msg && !msg.deletedAt ? msg.content.slice(0, 140) : '',
        readAt: r.readAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  async clearForChannel(userId: string, channelId: string) {
    await this.prisma.notification.deleteMany({ where: { userId, channelId } });
  }

  async clearForMessage(messageId: string) {
    await this.prisma.notification.deleteMany({ where: { messageId } });
  }
}
