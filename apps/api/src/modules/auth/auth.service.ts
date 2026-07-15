import { Injectable, UnauthorizedException } from '@nestjs/common';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    const days = Number(config.get('REFRESH_TOKEN_TTL_DAYS', 30));
    this.refreshTtlMs = days * 24 * 60 * 60 * 1000;
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
