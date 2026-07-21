import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateTaskRequest, TaskDto, UpdateTaskRequest } from '@inmobiles/shared-types';
import { ServerEvents } from '@inmobiles/shared-types';
import type { Task } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../gateway/realtime.service';
import { ChannelsService } from '../channels/channels.service';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly channels: ChannelsService,
  ) {}

  private async toDto(t: Task): Promise<TaskDto> {
    const ids = [t.creatorId, t.assigneeId].filter(Boolean) as string[];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return {
      id: t.id,
      channelId: t.channelId,
      title: t.title,
      done: t.done,
      dueAt: t.dueAt?.toISOString() ?? null,
      creator: byId.get(t.creatorId) ?? { id: t.creatorId, displayName: '' },
      assignee: t.assigneeId ? byId.get(t.assigneeId) ?? null : null,
      createdAt: t.createdAt.toISOString(),
    };
  }

  /** Personal tasks = assigned to or created by me with no channel; plus tasks
   * assigned to me in any channel. */
  async listMine(userId: string): Promise<TaskDto[]> {
    const rows = await this.prisma.task.findMany({
      where: { OR: [{ assigneeId: userId }, { creatorId: userId, channelId: null }] },
      orderBy: [{ done: 'asc' }, { createdAt: 'desc' }],
    });
    return Promise.all(rows.map((t) => this.toDto(t)));
  }

  async listChannel(channelId: string, userId: string): Promise<TaskDto[]> {
    await this.channels.requireMembership(channelId, userId);
    const rows = await this.prisma.task.findMany({
      where: { channelId },
      orderBy: [{ done: 'asc' }, { createdAt: 'desc' }],
    });
    return Promise.all(rows.map((t) => this.toDto(t)));
  }

  async create(userId: string, dto: CreateTaskRequest): Promise<TaskDto> {
    const m = await this.prisma.workspaceMember.findFirstOrThrow({ where: { userId } });
    if (dto.channelId) await this.channels.requireMembership(dto.channelId, userId);
    const task = await this.prisma.task.create({
      data: {
        workspaceId: m.workspaceId,
        channelId: dto.channelId ?? null,
        creatorId: userId,
        assigneeId: dto.assigneeId ?? null,
        title: dto.title,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      },
    });
    const dto2 = await this.toDto(task);
    if (task.channelId) this.realtime.toChannel(task.channelId, ServerEvents.TaskUpdate, { channelId: task.channelId });
    if (task.assigneeId) this.realtime.toUser(task.assigneeId, ServerEvents.TaskUpdate, { channelId: task.channelId });
    return dto2;
  }

  async update(id: string, userId: string, dto: UpdateTaskRequest): Promise<TaskDto> {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    if (task.channelId) await this.channels.requireMembership(task.channelId, userId);
    else if (task.creatorId !== userId && task.assigneeId !== userId) {
      throw new ForbiddenException('Not your task');
    }
    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.done !== undefined ? { done: dto.done } : {}),
        ...(dto.assigneeId !== undefined ? { assigneeId: dto.assigneeId } : {}),
        ...(dto.dueAt !== undefined ? { dueAt: dto.dueAt ? new Date(dto.dueAt) : null } : {}),
      },
    });
    if (updated.channelId) this.realtime.toChannel(updated.channelId, ServerEvents.TaskUpdate, { channelId: updated.channelId });
    return this.toDto(updated);
  }

  async remove(id: string, userId: string): Promise<void> {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) return;
    if (task.channelId) await this.channels.requireMembership(task.channelId, userId);
    else if (task.creatorId !== userId) throw new ForbiddenException('Not your task');
    await this.prisma.task.delete({ where: { id } });
    if (task.channelId) this.realtime.toChannel(task.channelId, ServerEvents.TaskUpdate, { channelId: task.channelId });
  }
}
