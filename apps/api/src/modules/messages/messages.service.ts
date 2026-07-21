import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { MessageDto, MessagePage, SendMessageRequest } from '@inmobiles/shared-types';
import { ServerEvents } from '@inmobiles/shared-types';
import type { Message, Prisma, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../gateway/realtime.service';
import { ChannelsService } from '../channels/channels.service';
import { S3Service } from '../files/s3.service';
import { NotificationsService } from '../notifications/notifications.service';

const PAGE_SIZE = 50;

const messageInclude = {
  author: { select: { id: true, displayName: true, avatarUrl: true } },
  reactions: { select: { emoji: true, userId: true } },
  attachments: {
    select: { id: true, filename: true, mimeType: true, sizeBytes: true },
    where: { status: 'ready' },
  },
  forwardedFrom: {
    select: {
      author: { select: { displayName: true } },
      channel: { select: { name: true } },
    },
  },
} satisfies Prisma.MessageInclude;

type MessageHydrated = Message & {
  author: Pick<User, 'id' | 'displayName' | 'avatarUrl'>;
  reactions: { emoji: string; userId: string }[];
  attachments: { id: string; filename: string; mimeType: string; sizeBytes: bigint }[];
  forwardedFrom: { author: { displayName: string }; channel: { name: string | null } } | null;
};

const encodeCursor = (m: Message) =>
  Buffer.from(`${m.createdAt.toISOString()}|${m.id}`).toString('base64url');

const decodeCursor = (cursor: string): { createdAt: Date; id: string } => {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime()) || !id) {
    throw new BadRequestException('Invalid cursor');
  }
  return { createdAt, id };
};

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly channels: ChannelsService,
    private readonly s3: S3Service,
    private readonly notifications: NotificationsService,
  ) {}

  private toDto(m: MessageHydrated, isSaved = false): MessageDto {
    const byEmoji = new Map<string, string[]>();
    for (const r of m.reactions) {
      const list = byEmoji.get(r.emoji) ?? [];
      list.push(r.userId);
      byEmoji.set(r.emoji, list);
    }
    return {
      id: m.id,
      channelId: m.channelId,
      parentMessageId: m.parentMessageId,
      content: m.deletedAt ? '' : m.content,
      clientMsgId: m.clientMsgId,
      author: {
        id: m.author.id,
        displayName: m.author.displayName,
        avatarUrl: m.author.avatarUrl,
      },
      replyCount: m.replyCount,
      isEdited: m.isEdited,
      isDeleted: m.deletedAt !== null,
      isPinned: m.isPinned,
      reactions: [...byEmoji.entries()].map(([emoji, userIds]) => ({ emoji, userIds })),
      attachments: m.deletedAt
        ? []
        : m.attachments.map((a) => ({
            id: a.id,
            filename: a.filename,
            mimeType: a.mimeType,
            sizeBytes: Number(a.sizeBytes),
            isImage: a.mimeType.startsWith('image/'),
          })),
      isSaved,
      forwardedFrom: m.forwardedFrom
        ? {
            authorDisplayName: m.forwardedFrom.author.displayName,
            channelName: m.forwardedFrom.channel.name,
          }
        : null,
      lastReplyAt: m.lastReplyAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    };
  }

  /** Mark which of these messages the viewer has saved (one batched query). */
  private async withSaved(dtos: MessageDto[], userId: string): Promise<MessageDto[]> {
    if (dtos.length === 0) return dtos;
    const saved = await this.prisma.savedMessage.findMany({
      where: { userId, messageId: { in: dtos.map((d) => d.id) } },
      select: { messageId: true },
    });
    const set = new Set(saved.map((s) => s.messageId));
    return dtos.map((d) => (set.has(d.id) ? { ...d, isSaved: true } : d));
  }

  private async hydrate(messageId: string): Promise<MessageHydrated> {
    return this.prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      include: messageInclude,
    });
  }

  async send(channelId: string, userId: string, dto: SendMessageRequest): Promise<MessageDto> {
    await this.channels.requirePostable(channelId, userId, !!dto.parentMessageId);

    // Idempotency: same clientMsgId returns the already-persisted message.
    const existing = await this.prisma.message.findUnique({
      where: { channelId_clientMsgId: { channelId, clientMsgId: dto.clientMsgId } },
      include: messageInclude,
    });
    if (existing) return this.toDto(existing);

    if (dto.parentMessageId) {
      const parent = await this.prisma.message.findUnique({ where: { id: dto.parentMessageId } });
      if (!parent || parent.channelId !== channelId) {
        throw new BadRequestException('Thread parent not found in this channel');
      }
      if (parent.parentMessageId) {
        throw new BadRequestException('Threads are one level deep — reply to the thread parent');
      }
    }

    const message = await this.prisma.$transaction(async (tx) => {
      // Attachments must be the sender's own, for this channel, and unlinked.
      const attachmentIds = [...new Set(dto.attachmentIds ?? [])];
      if (attachmentIds.length > 0) {
        const attachments = await tx.attachment.findMany({
          where: { id: { in: attachmentIds } },
        });
        const valid =
          attachments.length === attachmentIds.length &&
          attachments.every(
            (a) =>
              a.uploaderId === userId &&
              a.channelId === channelId &&
              a.status === 'ready' &&
              a.messageId === null,
          );
        if (!valid) throw new BadRequestException('Invalid attachments');
      }

      const created = await tx.message.create({
        data: {
          channelId,
          userId,
          content: dto.content,
          clientMsgId: dto.clientMsgId,
          parentMessageId: dto.parentMessageId,
        },
        include: messageInclude,
      });
      if (attachmentIds.length > 0) {
        await tx.attachment.updateMany({
          where: { id: { in: attachmentIds } },
          data: { messageId: created.id },
        });
        const linked = await tx.attachment.findMany({
          where: { id: { in: attachmentIds } },
          select: { id: true, filename: true, mimeType: true, sizeBytes: true },
        });
        created.attachments = linked;
      }
      await tx.channel.update({
        where: { id: channelId },
        data: { lastMessageAt: created.createdAt },
      });
      // Author self-read: your own message never makes the channel unread,
      // on any of your devices.
      await tx.channelMember.update({
        where: { channelId_userId: { channelId, userId } },
        data: { lastReadAt: created.createdAt, lastReadMessageId: created.id },
      });
      if (dto.parentMessageId) {
        await tx.message.update({
          where: { id: dto.parentMessageId },
          data: { replyCount: { increment: 1 }, lastReplyAt: created.createdAt },
        });
      }
      return created;
    });

    const messageDto = this.toDto(message);
    if (dto.parentMessageId) {
      this.realtime.toChannel(channelId, ServerEvents.ThreadReply, {
        parentMessageId: dto.parentMessageId,
        message: messageDto,
      });
    } else {
      this.realtime.toChannel(channelId, ServerEvents.MessageNew, { message: messageDto });
    }

    void (async () => {
      const channel = await this.prisma.channel.findUniqueOrThrow({ where: { id: channelId } });
      await this.notifications.fanOutForMessage(message, channel, userId);
    })().catch(() => undefined);

    return messageDto;
  }

  /** Store a recorded voice note and post it as a playable message. */
  async sendVoiceNote(
    channelId: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<MessageDto> {
    await this.channels.requirePostable(channelId, userId, false);
    if (!file?.buffer?.length) throw new BadRequestException('Empty voice note');

    const channel = await this.prisma.channel.findUniqueOrThrow({
      where: { id: channelId },
      select: { workspaceId: true },
    });
    const mime = file.mimetype || 'audio/webm';
    const key = `voice-notes/${channel.workspaceId}/${channelId}/${randomUUID()}.webm`;
    await this.s3.putObject(key, file.buffer, mime);

    const attachment = await this.prisma.attachment.create({
      data: {
        uploaderId: userId,
        workspaceId: channel.workspaceId,
        s3Key: key,
        filename: `voice-note-${new Date().toISOString().slice(0, 16).replace(':', '-')}.webm`,
        mimeType: mime,
        sizeBytes: BigInt(file.buffer.length),
        status: 'ready',
      },
    });
    const message = await this.send(channelId, userId, {
      content: `[voice:${attachment.id}]`,
      clientMsgId: randomUUID(),
    });
    await this.prisma.attachment.update({
      where: { id: attachment.id },
      data: { messageId: message.id },
    });
    return message;
  }

  async list(channelId: string, userId: string, cursor?: string): Promise<MessagePage> {
    await this.channels.requireMembership(channelId, userId);

    const where = {
      channelId,
      parentMessageId: null,
      ...(cursor
        ? {
            OR: (() => {
              const c = decodeCursor(cursor);
              return [
                { createdAt: { lt: c.createdAt } },
                { createdAt: c.createdAt, id: { lt: c.id } },
              ];
            })(),
          }
        : {}),
    };

    const rows = await this.prisma.message.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE + 1,
      include: messageInclude,
    });

    const hasMore = rows.length > PAGE_SIZE;
    const page = rows.slice(0, PAGE_SIZE);
    const messages = await this.withSaved(
      page.map((m) => this.toDto(m)).reverse(),
      userId,
    );
    return {
      messages,
      nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
    };
  }

  async listThread(
    parentMessageId: string,
    userId: string,
  ): Promise<{ parent: MessageDto; messages: MessageDto[] }> {
    const parent = await this.prisma.message.findUnique({
      where: { id: parentMessageId },
      include: messageInclude,
    });
    if (!parent) throw new NotFoundException('Message not found');
    await this.channels.requireMembership(parent.channelId, userId);
    const rows = await this.prisma.message.findMany({
      where: { parentMessageId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: messageInclude,
    });
    const [parentDto] = await this.withSaved([this.toDto(parent)], userId);
    return {
      parent: parentDto,
      messages: await this.withSaved(rows.map((m) => this.toDto(m)), userId),
    };
  }

  async listPins(channelId: string, userId: string): Promise<MessageDto[]> {
    await this.channels.requireMembership(channelId, userId);
    const rows = await this.prisma.message.findMany({
      where: { channelId, isPinned: true, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
      include: messageInclude,
    });
    return this.withSaved(rows.map((m) => this.toDto(m)), userId);
  }

  // ---------- Forward ----------

  async forward(messageId: string, userId: string, targetChannelId: string): Promise<MessageDto> {
    const source = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { attachments: { where: { status: 'ready' } } },
    });
    if (!source || source.deletedAt) throw new NotFoundException('Message not found');
    await this.channels.requireMembership(source.channelId, userId);
    await this.channels.requirePostable(targetChannelId, userId, false);

    const created = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          channelId: targetChannelId,
          userId,
          content: source.content,
          clientMsgId: randomUUID(),
          forwardedFromId: source.id,
        },
      });
      // Duplicate attachment rows so the forwarded copy carries the same files.
      for (const a of source.attachments) {
        await tx.attachment.create({
          data: {
            messageId: msg.id,
            channelId: targetChannelId,
            uploaderId: userId,
            workspaceId: a.workspaceId,
            s3Key: a.s3Key,
            filename: a.filename,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            width: a.width,
            height: a.height,
            thumbS3Key: a.thumbS3Key,
            status: 'ready',
          },
        });
      }
      await tx.channel.update({
        where: { id: targetChannelId },
        data: { lastMessageAt: msg.createdAt },
      });
      return msg;
    });

    const dto = this.toDto(await this.hydrate(created.id));
    this.realtime.toChannel(targetChannelId, ServerEvents.MessageNew, dto);
    return dto;
  }

  // ---------- Saved messages ----------

  async saveMessage(messageId: string, userId: string): Promise<{ saved: boolean }> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException('Message not found');
    await this.channels.requireMembership(message.channelId, userId);
    await this.prisma.savedMessage.upsert({
      where: { userId_messageId: { userId, messageId } },
      update: {},
      create: { userId, messageId },
    });
    return { saved: true };
  }

  async unsaveMessage(messageId: string, userId: string): Promise<{ saved: boolean }> {
    await this.prisma.savedMessage.deleteMany({ where: { userId, messageId } });
    return { saved: false };
  }

  async listSaved(userId: string): Promise<MessageDto[]> {
    const rows = await this.prisma.savedMessage.findMany({
      where: { userId, message: { deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { message: { include: messageInclude } },
    });
    return rows.map((r) => this.toDto(r.message, true));
  }

  async edit(messageId: string, userId: string, content: string): Promise<MessageDto> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException('Message not found');
    if (message.userId !== userId) throw new ForbiddenException('You can only edit your own messages');

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content, isEdited: true },
      include: messageInclude,
    });
    const dto = this.toDto(updated);
    this.realtime.toChannel(updated.channelId, ServerEvents.MessageUpdated, { message: dto });
    return dto;
  }

  /** Add or remove the caller's reaction; broadcasts the fresh message. */
  async toggleReaction(messageId: string, userId: string, emoji: string): Promise<MessageDto> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException('Message not found');
    await this.channels.requireMembership(message.channelId, userId);

    const existing = await this.prisma.reaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
    });
    if (existing) {
      await this.prisma.reaction.delete({
        where: { messageId_userId_emoji: { messageId, userId, emoji } },
      });
    } else {
      await this.prisma.reaction.create({ data: { messageId, userId, emoji } });
    }

    const dto = this.toDto(await this.hydrate(messageId));
    this.realtime.toChannel(message.channelId, ServerEvents.MessageUpdated, { message: dto });
    return dto;
  }

  /** Any channel member can pin/unpin (Slack semantics). */
  async togglePin(messageId: string, userId: string): Promise<MessageDto> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException('Message not found');
    await this.channels.requireMembership(message.channelId, userId);

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { isPinned: !message.isPinned },
      include: messageInclude,
    });
    const dto = this.toDto(updated);
    this.realtime.toChannel(message.channelId, ServerEvents.MessageUpdated, { message: dto });
    return dto;
  }

  async remove(messageId: string, userId: string): Promise<void> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException('Message not found');
    if (message.userId !== userId) {
      const membership = await this.prisma.workspaceMember.findFirst({
        where: { userId, role: { in: ['owner', 'admin'] } },
      });
      if (!membership) throw new ForbiddenException('You can only delete your own messages');
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), isPinned: false },
    });
    void this.notifications.clearForMessage(messageId).catch(() => undefined);
    this.realtime.toChannel(message.channelId, ServerEvents.MessageDeleted, {
      messageId,
      channelId: message.channelId,
    });
  }
}
