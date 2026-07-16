import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import type {
  AcceptSignupRequest,
  SignupPreview,
  WorkspaceInviteDto,
} from '@inmobiles/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { MailService } from './mail.service';

const INVITE_TTL_DAYS = 7;

@Injectable()
export class WorkspaceInvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly mail: MailService,
  ) {}

  private async requireAdmin(userId: string) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId, role: { in: ['owner', 'admin'] } },
      include: { workspace: true },
    });
    if (!membership) {
      throw new ForbiddenException('Only workspace admins can manage invites');
    }
    return membership;
  }

  private toDto(
    invite: {
      id: string;
      email: string;
      role: 'owner' | 'admin' | 'member' | 'guest';
      token: string;
      expiresAt: Date;
      createdAt: Date;
    },
    invitedBy: string,
  ): WorkspaceInviteDto {
    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      token: invite.token,
      invitedBy,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
    };
  }

  async create(
    userId: string,
    emails: string[],
    role: 'member' | 'admin',
  ): Promise<{ invites: WorkspaceInviteDto[]; skipped: string[] }> {
    const membership = await this.requireAdmin(userId);
    const inviter = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const normalized = Array.from(new Set(emails.map((e) => e.toLowerCase())));
    const existingUsers = await this.prisma.user.findMany({
      where: { email: { in: normalized }, deletedAt: null },
      select: { email: true },
    });
    const taken = new Set(existingUsers.map((u) => u.email));

    const invites: WorkspaceInviteDto[] = [];
    const skipped: string[] = [];
    for (const email of normalized) {
      if (taken.has(email)) {
        skipped.push(email);
        continue;
      }
      // Reuse a still-valid pending invite instead of minting duplicates.
      let invite = await this.prisma.workspaceInvite.findFirst({
        where: {
          workspaceId: membership.workspaceId,
          email,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!invite) {
        invite = await this.prisma.workspaceInvite.create({
          data: {
            workspaceId: membership.workspaceId,
            email,
            role,
            token: randomBytes(24).toString('base64url'),
            invitedById: userId,
            expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
          },
        });
      }
      await this.mail.sendWorkspaceInvite(
        email,
        inviter.displayName,
        membership.workspace.name,
        invite.token,
      );
      invites.push(this.toDto(invite, inviter.displayName));
    }
    return { invites, skipped };
  }

  async listPending(userId: string): Promise<WorkspaceInviteDto[]> {
    const membership = await this.requireAdmin(userId);
    const invites = await this.prisma.workspaceInvite.findMany({
      where: {
        workspaceId: membership.workspaceId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { invitedBy: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return invites.map((i) => this.toDto(i, i.invitedBy.displayName));
  }

  async revoke(userId: string, inviteId: string): Promise<void> {
    const membership = await this.requireAdmin(userId);
    const invite = await this.prisma.workspaceInvite.findUnique({ where: { id: inviteId } });
    if (!invite || invite.workspaceId !== membership.workspaceId) {
      throw new NotFoundException('Invite not found');
    }
    await this.prisma.workspaceInvite.update({
      where: { id: inviteId },
      data: { revokedAt: new Date() },
    });
  }

  // ---------- Public signup ----------

  private async findValidInvite(token: string) {
    const invite = await this.prisma.workspaceInvite.findUnique({
      where: { token },
      include: {
        workspace: { select: { id: true, name: true } },
        invitedBy: { select: { displayName: true } },
      },
    });
    if (!invite) throw new NotFoundException('This invite link is invalid');
    if (invite.revokedAt || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw new GoneException('This invite link has expired or was already used');
    }
    return invite;
  }

  async preview(token: string): Promise<SignupPreview> {
    const invite = await this.findValidInvite(token);
    return {
      email: invite.email,
      workspaceName: invite.workspace.name,
      invitedBy: invite.invitedBy.displayName,
    };
  }

  /** Create the account, join workspace + public channels, and log them in. */
  async accept(token: string, dto: AcceptSignupRequest, userAgent?: string) {
    const invite = await this.findValidInvite(token);

    const existing = await this.prisma.user.findUnique({ where: { email: invite.email } });
    if (existing && !existing.deletedAt) {
      throw new BadRequestException('An account with this email already exists — just sign in');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: { displayName: dto.displayName, passwordHash, deletedAt: null },
          })
        : await tx.user.create({
            data: { email: invite.email, displayName: dto.displayName, passwordHash },
          });
      await tx.workspaceMember.upsert({
        where: {
          workspaceId_userId: { workspaceId: invite.workspaceId, userId: created.id },
        },
        update: { role: invite.role },
        create: { workspaceId: invite.workspaceId, userId: created.id, role: invite.role },
      });
      const publicChannels = await tx.channel.findMany({
        where: { workspaceId: invite.workspaceId, type: 'public', isArchived: false },
        select: { id: true },
      });
      await tx.channelMember.createMany({
        data: publicChannels.map((c) => ({ channelId: c.id, userId: created.id })),
        skipDuplicates: true,
      });
      await tx.workspaceInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      return created;
    });

    const { accessToken, refreshToken } = await this.auth.issueTokens(user.id, userAgent);
    return {
      accessToken,
      refreshToken,
      user: await this.auth.getAuthUser(user.id),
    };
  }
}
