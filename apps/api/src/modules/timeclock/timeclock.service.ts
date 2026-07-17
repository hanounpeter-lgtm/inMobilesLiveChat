import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type {
  ClockAction,
  ClockStatus,
  TimeclockMe,
  TimeclockTeamEntry,
} from '@inmobiles/shared-types';
import { ServerEvents } from '@inmobiles/shared-types';
import type { ClockKind, WorkClockEvent } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../gateway/realtime.service';

const ACTION_TO_KIND: Record<ClockAction, ClockKind> = {
  'clock-in': 'clock_in',
  'break-start': 'break_start',
  'break-end': 'break_end',
  'clock-out': 'clock_out',
};

const statusAfter = (kind: ClockKind | undefined): ClockStatus => {
  if (kind === 'clock_in' || kind === 'break_end') return 'working';
  if (kind === 'break_start') return 'break';
  return 'off';
};

const VALID_FROM: Record<ClockKind, ClockStatus[]> = {
  clock_in: ['off'],
  break_start: ['working'],
  break_end: ['break'],
  clock_out: ['working', 'break'],
};

@Injectable()
export class TimeclockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  private async lastEvent(userId: string, before?: Date): Promise<WorkClockEvent | null> {
    return this.prisma.workClockEvent.findFirst({
      where: { userId, ...(before ? { at: { lt: before } } : {}) },
      orderBy: { at: 'desc' },
    });
  }

  async act(userId: string, action: ClockAction): Promise<TimeclockMe> {
    const membership = await this.prisma.workspaceMember.findFirst({ where: { userId } });
    if (!membership) throw new ForbiddenException('Not in a workspace');

    const kind = ACTION_TO_KIND[action];
    const last = await this.lastEvent(userId);
    const current = statusAfter(last?.kind);
    if (!VALID_FROM[kind].includes(current)) {
      throw new BadRequestException(
        `Cannot ${action.replace('-', ' ')} while ${current === 'off' ? 'clocked out' : current === 'break' ? 'on break' : 'working'}`,
      );
    }

    const event = await this.prisma.workClockEvent.create({
      data: { userId, workspaceId: membership.workspaceId, kind },
    });

    this.realtime.toWorkspace(membership.workspaceId, ServerEvents.TimeclockUpdate, {
      userId,
      status: statusAfter(kind),
      since: event.at.toISOString(),
    });
    return this.me(userId);
  }

  /** Current status + today's worked/break totals (UTC day boundary). */
  async me(userId: string): Promise<TimeclockMe> {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const [before, today] = await Promise.all([
      this.lastEvent(userId, startOfDay),
      this.prisma.workClockEvent.findMany({
        where: { userId, at: { gte: startOfDay } },
        orderBy: { at: 'asc' },
      }),
    ]);

    let status = statusAfter(before?.kind);
    let cursor = startOfDay.getTime();
    let workedMs = 0;
    let breakMs = 0;
    const tally = (until: number) => {
      if (status === 'working') workedMs += until - cursor;
      if (status === 'break') breakMs += until - cursor;
    };
    for (const event of today) {
      tally(event.at.getTime());
      cursor = event.at.getTime();
      status = statusAfter(event.kind);
    }
    tally(Date.now());

    const lastToday = today[today.length - 1] ?? before;
    return {
      status,
      since: lastToday && status !== 'off' ? lastToday.at.toISOString() : null,
      workedMsToday: Math.max(0, Math.round(workedMs)),
      breakMsToday: Math.max(0, Math.round(breakMs)),
    };
  }

  /** Everyone's current status — two queries via distinct-on. */
  async team(userId: string): Promise<TimeclockTeamEntry[]> {
    const membership = await this.prisma.workspaceMember.findFirst({ where: { userId } });
    if (!membership) return [];

    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: membership.workspaceId },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true, deletedAt: true } },
      },
    });
    const lastEvents = await this.prisma.$queryRaw<
      { user_id: string; kind: ClockKind; at: Date }[]
    >`SELECT DISTINCT ON (user_id) user_id, kind, at
      FROM work_clock_events
      WHERE workspace_id = ${membership.workspaceId}::uuid
      ORDER BY user_id, at DESC`;
    const byUser = new Map(lastEvents.map((e) => [e.user_id, e]));

    return members
      .filter((m) => !m.user.deletedAt)
      .map((m) => {
        const last = byUser.get(m.userId);
        const status = statusAfter(last?.kind);
        return {
          userId: m.userId,
          displayName: m.user.displayName,
          avatarUrl: m.user.avatarUrl,
          status,
          since: last && status !== 'off' ? last.at.toISOString() : null,
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
}
