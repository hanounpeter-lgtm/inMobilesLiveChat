import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { MeetingDto, ScheduleMeetingRequest } from '@inmobiles/shared-types';
import { ServerEvents } from '@inmobiles/shared-types';
import type { CallType, ScheduledMeeting, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../gateway/realtime.service';
import { ChannelsService } from '../channels/channels.service';
import { MessagesService } from '../messages/messages.service';

type MeetingWithCreator = ScheduledMeeting & { createdBy: Pick<User, 'id' | 'displayName'> };

@Injectable()
export class MeetingsService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly channels: ChannelsService,
    private readonly messages: MessagesService,
  ) {}

  onModuleInit() {
    // Poll for meetings whose time has arrived and post a reminder to the channel.
    this.timer = setInterval(() => void this.fireDue().catch(() => undefined), 30_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private toDto(m: MeetingWithCreator): MeetingDto {
    return {
      id: m.id,
      channelId: m.channelId,
      title: m.title,
      description: m.description,
      type: m.type as 'audio' | 'video',
      scheduledAt: m.scheduledAt.toISOString(),
      createdBy: { id: m.createdBy.id, displayName: m.createdBy.displayName },
    };
  }

  async create(channelId: string, userId: string, body: ScheduleMeetingRequest): Promise<MeetingDto> {
    await this.channels.requireMembership(channelId, userId);
    const meeting = await this.prisma.scheduledMeeting.create({
      data: {
        channelId,
        createdById: userId,
        title: body.title,
        description: body.description ?? null,
        type: body.type as CallType,
        scheduledAt: new Date(body.scheduledAt),
      },
      include: { createdBy: { select: { id: true, displayName: true } } },
    });
    const dto = this.toDto(meeting);
    this.realtime.toChannel(channelId, ServerEvents.MeetingScheduled, { meeting: dto });
    return dto;
  }

  async list(channelId: string, userId: string): Promise<MeetingDto[]> {
    await this.channels.requireMembership(channelId, userId);
    const rows = await this.prisma.scheduledMeeting.findMany({
      where: { channelId, scheduledAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
      orderBy: { scheduledAt: 'asc' },
      include: { createdBy: { select: { id: true, displayName: true } } },
    });
    return rows.map((r) => this.toDto(r));
  }

  async cancel(meetingId: string, userId: string): Promise<void> {
    const meeting = await this.prisma.scheduledMeeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    await this.channels.requireMembership(meeting.channelId, userId);
    if (meeting.createdById !== userId) {
      throw new ForbiddenException('Only the organizer can cancel this meeting');
    }
    await this.prisma.scheduledMeeting.delete({ where: { id: meetingId } });
    this.realtime.toChannel(meeting.channelId, ServerEvents.MeetingCancelled, {
      meetingId,
      channelId: meeting.channelId,
    });
  }

  private async fireDue() {
    const due = await this.prisma.scheduledMeeting.findMany({
      where: { reminded: false, scheduledAt: { lte: new Date() } },
      include: { createdBy: { select: { id: true, displayName: true } } },
      take: 20,
    });
    for (const m of due) {
      await this.prisma.scheduledMeeting.update({
        where: { id: m.id },
        data: { reminded: true },
      });
      await this.messages.send(m.channelId, m.createdById, {
        content: `Scheduled meeting starting now: ${m.title}`,
        clientMsgId: randomUUID(),
      });
      this.realtime.toChannel(m.channelId, ServerEvents.MeetingCancelled, {
        meetingId: m.id,
        channelId: m.channelId,
      });
    }
  }
}
