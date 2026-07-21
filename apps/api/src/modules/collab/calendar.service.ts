import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { CalendarEventDto, CreateEventRequest } from '@inmobiles/shared-types';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  private async workspaceId(userId: string): Promise<string> {
    const m = await this.prisma.workspaceMember.findFirstOrThrow({ where: { userId } });
    return m.workspaceId;
  }

  private async toDto(eventId: string, userId: string): Promise<CalendarEventDto> {
    const e = await this.prisma.calendarEvent.findUniqueOrThrow({
      where: { id: eventId },
      include: { attendees: true },
    });
    const ids = [e.createdById, ...e.attendees.map((a) => a.userId)];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true },
    });
    const name = new Map(users.map((u) => [u.id, u.displayName]));
    const mine = e.attendees.find((a) => a.userId === userId);
    return {
      id: e.id,
      title: e.title,
      description: e.description,
      startAt: e.startAt.toISOString(),
      endAt: e.endAt?.toISOString() ?? null,
      channelId: e.channelId,
      createdBy: { id: e.createdById, displayName: name.get(e.createdById) ?? '' },
      attendees: e.attendees.map((a) => ({
        userId: a.userId,
        displayName: name.get(a.userId) ?? '',
        status: a.status as 'pending' | 'accepted' | 'declined',
      })),
      myStatus: (mine?.status as 'pending' | 'accepted' | 'declined') ?? null,
    };
  }

  async list(userId: string): Promise<CalendarEventDto[]> {
    const wsId = await this.workspaceId(userId);
    const rows = await this.prisma.calendarEvent.findMany({
      where: { workspaceId: wsId },
      orderBy: { startAt: 'asc' },
      select: { id: true },
    });
    return Promise.all(rows.map((r) => this.toDto(r.id, userId)));
  }

  async create(userId: string, dto: CreateEventRequest): Promise<CalendarEventDto> {
    const wsId = await this.workspaceId(userId);
    const attendeeIds = Array.from(new Set([userId, ...(dto.attendeeIds ?? [])]));
    const event = await this.prisma.calendarEvent.create({
      data: {
        workspaceId: wsId,
        title: dto.title,
        description: dto.description ?? null,
        startAt: new Date(dto.startAt),
        endAt: dto.endAt ? new Date(dto.endAt) : null,
        channelId: dto.channelId ?? null,
        createdById: userId,
        attendees: {
          create: attendeeIds.map((id) => ({
            userId: id,
            status: id === userId ? 'accepted' : 'pending',
          })),
        },
      },
    });
    return this.toDto(event.id, userId);
  }

  async respond(eventId: string, userId: string, status: 'accepted' | 'declined'): Promise<CalendarEventDto> {
    const attendee = await this.prisma.eventAttendee.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (!attendee) throw new NotFoundException('You are not invited to this event');
    await this.prisma.eventAttendee.update({
      where: { eventId_userId: { eventId, userId } },
      data: { status },
    });
    return this.toDto(eventId, userId);
  }

  async remove(eventId: string, userId: string): Promise<void> {
    const event = await this.prisma.calendarEvent.findUnique({ where: { id: eventId } });
    if (!event) return;
    if (event.createdById !== userId) throw new ForbiddenException('Only the organizer can delete');
    await this.prisma.calendarEvent.delete({ where: { id: eventId } });
  }
}
