import { Injectable } from '@nestjs/common';
import type { ChannelNoteDto, UpdateNoteRequest } from '@inmobiles/shared-types';
import { ServerEvents } from '@inmobiles/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../gateway/realtime.service';
import { ChannelsService } from '../channels/channels.service';

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly channels: ChannelsService,
  ) {}

  async get(channelId: string, userId: string): Promise<ChannelNoteDto> {
    await this.channels.requireMembership(channelId, userId);
    const note = await this.prisma.channelNote.findUnique({ where: { channelId } });
    let updatedBy: string | null = null;
    if (note?.updatedById) {
      const u = await this.prisma.user.findUnique({
        where: { id: note.updatedById },
        select: { displayName: true },
      });
      updatedBy = u?.displayName ?? null;
    }
    return {
      channelId,
      content: note?.content ?? '',
      updatedAt: note?.updatedAt.toISOString() ?? null,
      updatedBy,
    };
  }

  async update(channelId: string, userId: string, dto: UpdateNoteRequest): Promise<ChannelNoteDto> {
    await this.channels.requireMembership(channelId, userId);
    await this.prisma.channelNote.upsert({
      where: { channelId },
      update: { content: dto.content, updatedById: userId },
      create: { channelId, content: dto.content, updatedById: userId },
    });
    this.realtime.toChannel(channelId, ServerEvents.NoteUpdate, { channelId });
    return this.get(channelId, userId);
  }
}
