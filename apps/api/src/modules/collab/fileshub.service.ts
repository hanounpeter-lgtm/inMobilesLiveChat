import { Injectable } from '@nestjs/common';
import type { FileHubItemDto } from '@inmobiles/shared-types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FilesHubService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every ready attachment in channels the user belongs to, newest first. */
  async list(userId: string, q?: string, type?: string): Promise<FileHubItemDto[]> {
    const memberships = await this.prisma.channelMember.findMany({
      where: { userId },
      select: { channelId: true },
    });
    const channelIds = memberships.map((m) => m.channelId);
    if (channelIds.length === 0) return [];

    const where: Prisma.AttachmentWhereInput = {
      channelId: { in: channelIds },
      status: 'ready',
      ...(q ? { filename: { contains: q, mode: 'insensitive' } } : {}),
    };
    if (type === 'image') where.mimeType = { startsWith: 'image/' };
    else if (type === 'video') where.mimeType = { startsWith: 'video/' };
    else if (type === 'audio') where.mimeType = { startsWith: 'audio/' };
    else if (type === 'pdf') where.mimeType = 'application/pdf';

    const rows = await this.prisma.attachment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const chIds = Array.from(new Set(rows.map((r) => r.channelId).filter(Boolean))) as string[];
    const upIds = Array.from(new Set(rows.map((r) => r.uploaderId)));
    const [channels, uploaders] = await Promise.all([
      this.prisma.channel.findMany({ where: { id: { in: chIds } }, select: { id: true, name: true } }),
      this.prisma.user.findMany({ where: { id: { in: upIds } }, select: { id: true, displayName: true } }),
    ]);
    const chName = new Map(channels.map((c) => [c.id, c.name]));
    const upName = new Map(uploaders.map((u) => [u.id, u.displayName]));

    return rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      mimeType: r.mimeType,
      sizeBytes: Number(r.sizeBytes),
      isImage: r.mimeType.startsWith('image/'),
      channelId: r.channelId,
      channelName: r.channelId ? chName.get(r.channelId) ?? null : null,
      uploaderName: upName.get(r.uploaderId) ?? '',
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
