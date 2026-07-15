import { Controller, Get, UseGuards } from '@nestjs/common';
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

  /** Workspace directory — used for starting DMs and @mention typeahead. */
  @Get()
  async list(@CurrentUserId() userId: string) {
    const membership = await this.prisma.workspaceMember.findFirst({ where: { userId } });
    if (!membership) return { users: [] };
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        workspaceMemberships: { some: { workspaceId: membership.workspaceId } },
      },
      orderBy: { displayName: 'asc' },
      select: { id: true, displayName: true, avatarUrl: true, statusText: true, email: true },
    });

    const online = new Set<string>();
    if (users.length > 0) {
      const keys = users.map((u) => `presence:online:${u.id}`);
      const values = await this.redis.client.mget(keys);
      values.forEach((v, i) => {
        if (v) online.add(users[i].id);
      });
    }

    return {
      users: users.map((u) => ({ ...u, online: online.has(u.id) })),
    };
  }
}
