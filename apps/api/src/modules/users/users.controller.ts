import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '../../common/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly auth: AuthService,
  ) {}

  @Get('me')
  me(@CurrentUserId() userId: string) {
    return this.auth.getAuthUser(userId);
  }

  /** Workspace directory — used for the people directory, starting DMs, and
   * @mention typeahead. Optional `q` filters by name/email/department/title. */
  @Get()
  async list(@CurrentUserId() userId: string, @Query('q') q?: string) {
    const membership = await this.prisma.workspaceMember.findFirst({ where: { userId } });
    if (!membership) return { users: [] };
    const term = q?.trim();
    const members = await this.prisma.workspaceMember.findMany({
      where: {
        workspaceId: membership.workspaceId,
        user: {
          deletedAt: null,
          ...(term
            ? {
                OR: [
                  { displayName: { contains: term, mode: 'insensitive' } },
                  { email: { contains: term, mode: 'insensitive' } },
                  { department: { contains: term, mode: 'insensitive' } },
                  { jobTitle: { contains: term, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
      },
      orderBy: { user: { displayName: 'asc' } },
      select: {
        role: true,
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            statusText: true,
            email: true,
            department: true,
            jobTitle: true,
          },
        },
      },
    });

    const online = new Set<string>();
    if (members.length > 0) {
      const keys = members.map((m) => `presence:online:${m.user.id}`);
      const values = await this.redis.client.mget(keys);
      values.forEach((v, i) => {
        if (v) online.add(members[i].user.id);
      });
    }

    return {
      users: members.map((m) => ({
        ...m.user,
        role: m.role,
        online: online.has(m.user.id),
      })),
    };
  }
}
