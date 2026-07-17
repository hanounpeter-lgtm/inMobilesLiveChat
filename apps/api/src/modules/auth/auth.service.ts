import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { v7 as uuidv7 } from 'uuid';
import type { AuthUser } from '@inmobiles/shared-types';
import { PrismaService } from '../../prisma/prisma.service';

export interface AccessTokenPayload {
  sub: string;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService {
  private readonly refreshTtlMs: number;
  private readonly allowedDomain: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    const days = Number(config.get('REFRESH_TOKEN_TTL_DAYS', 30));
    this.refreshTtlMs = days * 24 * 60 * 60 * 1000;
    this.allowedDomain = (config.get<string>('ALLOWED_EMAIL_DOMAIN', 'inmobiles.com') ?? '')
      .trim()
      .toLowerCase();
  }

  /** Company policy: accounts must use the workspace email domain. */
  isEmailDomainAllowed(email: string): boolean {
    if (!this.allowedDomain) return true;
    return email.toLowerCase().endsWith(`@${this.allowedDomain}`);
  }

  get emailDomain(): string {
    return this.allowedDomain;
  }

  /**
   * Public self-signup (enabled while the team is small; flip
   * ALLOW_PUBLIC_SIGNUP=false to force invite-only onboarding).
   * Joins the workspace as a member plus every public channel.
   */
  async register(displayName: string, email: string, password: string) {
    const normalized = email.toLowerCase();
    if (!this.isEmailDomainAllowed(normalized)) {
      throw new BadRequestException(
        `Only @${this.allowedDomain} email addresses can create an account`,
      );
    }
    const existing = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (existing && !existing.deletedAt) {
      throw new ConflictException('An account with this email already exists — sign in instead');
    }
    const workspace = await this.prisma.workspace.findFirst();
    if (!workspace) throw new UnauthorizedException('Workspace is not set up yet');

    const passwordHash = await argon2.hash(password);
    return this.prisma.$transaction(async (tx) => {
      const user = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: { displayName, passwordHash, deletedAt: null },
          })
        : await tx.user.create({ data: { email: normalized, displayName, passwordHash } });
      await tx.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
        update: {},
        create: { workspaceId: workspace.id, userId: user.id, role: 'member' },
      });
      const publicChannels = await tx.channel.findMany({
        where: { workspaceId: workspace.id, type: 'public', isArchived: false },
        select: { id: true },
      });
      await tx.channelMember.createMany({
        data: publicChannels.map((c) => ({ channelId: c.id, userId: user.id })),
        skipDuplicates: true,
      });
      return user;
    });
  }

  async validateCredentials(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user || user.deletedAt || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException('Invalid email or password');
    return user;
  }

  async issueTokens(userId: string, deviceInfo?: string, familyId?: string) {
    const accessToken = await this.jwt.signAsync({ sub: userId } satisfies AccessTokenPayload);
    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(refreshToken),
        familyId: familyId ?? uuidv7(),
        deviceInfo,
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
      },
    });
    return { accessToken, refreshToken };
  }

  /**
   * Rotating refresh: each refresh revokes the presented token and issues a new
   * one in the same family. Presenting an already-revoked token means theft —
   * the entire family is revoked.
   */
  async rotateRefreshToken(presented: string) {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(presented) },
    });
    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (record.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: record.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(record.userId, record.deviceInfo ?? undefined, record.familyId);
  }

  async revokeRefreshToken(presented: string) {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(presented), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      return await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  async getAuthUser(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { workspaceMemberships: { take: 1 } },
    });
    if (!user || user.deletedAt) throw new UnauthorizedException();
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      statusText: user.statusText,
      role: user.workspaceMemberships[0]?.role ?? 'member',
    };
  }
}
