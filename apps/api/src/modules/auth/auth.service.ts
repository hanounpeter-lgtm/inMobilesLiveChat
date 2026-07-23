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
  private readonly webOrigin: string;
  private readonly requireVerification: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    const days = Number(config.get('REFRESH_TOKEN_TTL_DAYS', 30));
    this.refreshTtlMs = days * 24 * 60 * 60 * 1000;
    this.allowedDomain = (config.get<string>('ALLOWED_EMAIL_DOMAIN', 'inmobiles.net') ?? '')
      .trim()
      .toLowerCase();
    this.webOrigin = config.get<string>('WEB_ORIGIN', 'http://localhost:5173') ?? '';
    this.requireVerification = config.get<string>('REQUIRE_EMAIL_VERIFICATION') === 'true';
  }

  /** Start a password reset — returns the link (surfaced on-screen since real
   * email delivery isn't configured). Never reveals whether the email exists. */
  async forgotPassword(email: string): Promise<{ resetUrl: string | null }> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || user.deletedAt) return { resetUrl: null };
    const token = randomBytes(24).toString('base64url');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiry: new Date(Date.now() + 30 * 60 * 1000) },
    });
    return { resetUrl: `${this.webOrigin}/reset-password?token=${token}` };
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { resetToken: token } });
    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      throw new BadRequestException('This reset link is invalid or has expired');
    }
    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetToken: null, resetTokenExpiry: null },
    });
    // Kill all existing sessions after a password change.
    await this.prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  }

  async verifyEmail(token: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { verifyToken: token } });
    if (!user) throw new BadRequestException('This verification link is invalid');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verifyToken: null },
    });
  }

  /** Link the user can use to verify their email (shown on-screen after signup). */
  async verifyUrlFor(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.emailVerified) return null;
    let token = user.verifyToken;
    if (!token) {
      token = randomBytes(24).toString('base64url');
      await this.prisma.user.update({ where: { id: userId }, data: { verifyToken: token } });
    }
    return `${this.webOrigin}/verify-email?token=${token}`;
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
      const verified = !this.requireVerification;
      const verifyToken = verified ? null : randomBytes(24).toString('base64url');
      const user = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: { displayName, passwordHash, deletedAt: null, emailVerified: verified, verifyToken },
          })
        : await tx.user.create({
            data: { email: normalized, displayName, passwordHash, emailVerified: verified, verifyToken },
          });
      // Bootstrap: the very first person to join an empty workspace becomes its
      // owner, so a freshly-provisioned workspace is never left without an admin.
      const memberCount = await tx.workspaceMember.count({
        where: { workspaceId: workspace.id },
      });
      const role = memberCount === 0 ? 'owner' : 'member';
      await tx.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
        update: {},
        create: { workspaceId: workspace.id, userId: user.id, role },
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
    if (this.requireVerification && !user.emailVerified) {
      throw new UnauthorizedException('Please verify your email address before signing in');
    }
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
      department: user.department,
      jobTitle: user.jobTitle,
      role: user.workspaceMemberships[0]?.role ?? 'member',
    };
  }
}
