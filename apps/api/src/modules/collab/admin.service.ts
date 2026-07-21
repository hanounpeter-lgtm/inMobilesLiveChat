import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AdminStatsDto, AdminUserDto } from '@inmobiles/shared-types';
import { ServerEvents } from '@inmobiles/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../gateway/realtime.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  private async requireAdmin(userId: string): Promise<string> {
    const m = await this.prisma.workspaceMember.findFirst({ where: { userId } });
    if (!m || (m.role !== 'owner' && m.role !== 'admin')) {
      throw new ForbiddenException('Admins only');
    }
    return m.workspaceId;
  }

  async stats(userId: string): Promise<AdminStatsDto> {
    await this.requireAdmin(userId);
    const [users, channels, messages, calls] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.channel.count(),
      this.prisma.message.count({ where: { deletedAt: null } }),
      this.prisma.call.count(),
    ]);
    // Messages per day for the last 7 days.
    const rows = await this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
      SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date, count(*)::bigint AS count
      FROM messages
      WHERE created_at >= now() - interval '6 days' AND deleted_at IS NULL
      GROUP BY 1 ORDER BY 1`;
    const byDate = new Map(rows.map((r) => [r.date, Number(r.count)]));
    const activity: { date: string; messages: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      activity.push({ date: key, messages: byDate.get(key) ?? 0 });
    }
    return { totals: { users, channels, messages, calls }, activity };
  }

  async listUsers(userId: string): Promise<AdminUserDto[]> {
    const wsId = await this.requireAdmin(userId);
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: wsId },
      include: { user: true },
      orderBy: { user: { createdAt: 'asc' } },
    });
    return members.map((m) => ({
      id: m.user.id,
      email: m.user.email,
      displayName: m.user.displayName,
      role: m.role as 'owner' | 'admin' | 'member' | 'guest',
      active: m.user.deletedAt === null,
      createdAt: m.user.createdAt.toISOString(),
    }));
  }

  async setRole(userId: string, targetId: string, role: 'admin' | 'member'): Promise<void> {
    const wsId = await this.requireAdmin(userId);
    const target = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId: wsId, userId: targetId },
    });
    if (!target || target.role === 'owner') return; // never demote the owner
    await this.prisma.workspaceMember.updateMany({
      where: { workspaceId: wsId, userId: targetId },
      data: { role },
    });
  }

  async setActive(userId: string, targetId: string, active: boolean): Promise<void> {
    await this.requireAdmin(userId);
    if (targetId === userId) return;
    await this.prisma.user.update({
      where: { id: targetId },
      data: { deletedAt: active ? null : new Date() },
    });
    if (!active) {
      // Kill their sessions so a deactivated user is booted.
      await this.prisma.refreshToken.deleteMany({ where: { userId: targetId } });
    }
  }

  async deleteMessage(userId: string, messageId: string): Promise<void> {
    await this.requireAdmin(userId);
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) return;
    await this.prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
    this.realtime.toChannel(message.channelId, ServerEvents.MessageDeleted, {
      messageId,
      channelId: message.channelId,
    });
  }
}
