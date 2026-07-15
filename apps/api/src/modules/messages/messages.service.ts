import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { MessageDto, MessagePage, SendMessageRequest } from '@inmobiles/shared-types';
import { ServerEvents } from '@inmobiles/shared-types';
import type { Message, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../gateway/realtime.service';
import { ChannelsService } from '../channels/channels.service';

const PAGE_SIZE = 50;

type MessageWithAuthor = Message & {
  author: Pick<User, 'id' | 'displayName' | 'avatarUrl'>;
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
  ) {}

  private toDto(m: MessageWithAuthor): MessageDto {
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
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    };
  }

  async send(channelId: string, userId: string, dto: SendMessageRequest): Promise<MessageDto> {
    await this.channels.requirePostable(channelId, userId, !!dto.parentMessageId);

    // Idempotency: same clientMsgId returns the already-persisted message.
    const existing = await this.prisma.message.findUnique({
      where: { channelId_clientMsgId: { channelId, clientMsgId: dto.clientMsgId } },
      include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
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
      const created = await tx.message.create({
        data: {
          channelId,
          userId,
          content: dto.content,
          clientMsgId: dto.clientMsgId,
          parentMessageId: dto.parentMessageId,
        },
        include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
      });
      await tx.channel.update({
        where: { id: channelId },
        data: { lastMessageAt: created.createdAt },
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
    return messageDto;
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
      include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
    });

    const hasMore = rows.length > PAGE_SIZE;
    const page = rows.slice(0, PAGE_SIZE);
    return {
      messages: page.map((m) => this.toDto(m)).reverse(),
      nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
    };
  }

  async listThread(parentMessageId: string, userId: string): Promise<MessageDto[]> {
    const parent = await this.prisma.message.findUnique({ where: { id: parentMessageId } });
    if (!parent) throw new NotFoundException('Message not found');
    await this.channels.requireMembership(parent.channelId, userId);
    const rows = await this.prisma.message.findMany({
      where: { parentMessageId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
    });
    return rows.map((m) => this.toDto(m));
  }

  async edit(messageId: string, userId: string, content: string): Promise<MessageDto> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
    });
    if (!message || message.deletedAt) throw new NotFoundException('Message not found');
    if (message.userId !== userId) throw new ForbiddenException('You can only edit your own messages');

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content, isEdited: true },
      include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
    });
    const dto = this.toDto(updated);
    this.realtime.toChannel(updated.channelId, ServerEvents.MessageUpdated, { message: dto });
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
      data: { deletedAt: new Date() },
    });
    this.realtime.toChannel(message.channelId, ServerEvents.MessageDeleted, {
      messageId,
      channelId: message.channelId,
    });
  }
}
