import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import type {
  ChannelMemberDto,
  ChannelSummary,
  CreateChannelRequest,
  InviteLinkResponse,
  InvitePreview,
  MyChannelSettingsRequest,
  UpdateChannelRequest,
} from '@inmobiles/shared-types';
import { ServerEvents } from '@inmobiles/shared-types';
import type { Channel, ChannelMember, Prisma, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../gateway/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';

const memberInclude = {
  members: {
    include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
  },
  _count: { select: { members: true } },
} satisfies Prisma.ChannelInclude;

type ChannelWithMembers = Channel & {
  members: (ChannelMember & { user: Pick<User, 'id' | 'displayName' | 'avatarUrl'> })[];
  _count: { members: number };
};

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------- Guards ----------

  async requireMembership(channelId: string, userId: string) {
    const member = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!member) throw new ForbiddenException('Not a member of this channel');
    return member;
  }

  /** Channel managers = the creator or a workspace owner/admin. */
  async canManageChannel(
    channel: Pick<Channel, 'createdById' | 'workspaceId'>,
    userId: string,
  ): Promise<boolean> {
    if (channel.createdById === userId) return true;
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: channel.workspaceId, userId } },
    });
    return membership?.role === 'owner' || membership?.role === 'admin';
  }

  private async requireManage(channelId: string, userId: string): Promise<ChannelWithMembers> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: memberInclude,
    });
    if (!channel) throw new NotFoundException('Channel not found');
    if (!(await this.canManageChannel(channel, userId))) {
      throw new ForbiddenException('Only the channel creator or a workspace admin can do that');
    }
    return channel;
  }

  /** Membership + not archived + posting policy. Used by message sends. */
  async requirePostable(channelId: string, userId: string, isThreadReply: boolean) {
    await this.requireMembership(channelId, userId);
    const channel = await this.prisma.channel.findUniqueOrThrow({ where: { id: channelId } });
    if (channel.isArchived) throw new ForbiddenException('This channel is archived');
    if (
      channel.postingPolicy === 'admins_only' &&
      !isThreadReply &&
      !(await this.canManageChannel(channel, userId))
    ) {
      throw new ForbiddenException('Only admins can post in this channel');
    }
  }

  // ---------- Summaries ----------

  private toSummary(channel: ChannelWithMembers, selfId: string): ChannelSummary {
    const isDm = channel.type === 'dm' || channel.type === 'group_dm';
    const self = channel.members.find((m) => m.userId === selfId);
    return {
      id: channel.id,
      type: channel.type,
      name: channel.name,
      topic: channel.topic,
      description: channel.description,
      createdById: channel.createdById,
      isArchived: channel.isArchived,
      isDefault: channel.isDefault,
      postingPolicy: channel.postingPolicy,
      memberCount: channel._count.members,
      lastMessageAt: channel.lastMessageAt?.toISOString() ?? null,
      notifyLevel: self?.notifyLevel ?? 'all',
      isStarred: self?.isStarred ?? false,
      memberPreviews: isDm
        ? channel.members
            .filter((m) => m.user.id !== selfId)
            .map((m) => ({
              id: m.user.id,
              displayName: m.user.displayName,
              avatarUrl: m.user.avatarUrl,
            }))
        : undefined,
    };
  }

  async listMine(userId: string): Promise<ChannelSummary[]> {
    const channels = await this.prisma.channel.findMany({
      where: { members: { some: { userId } } },
      include: memberInclude,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return channels.map((c) => this.toSummary(c, userId));
  }

  /** Public channels the user can browse and join. */
  async browsePublic(userId: string) {
    const membership = await this.prisma.workspaceMember.findFirst({ where: { userId } });
    if (!membership) return [];
    const channels = await this.prisma.channel.findMany({
      where: { workspaceId: membership.workspaceId, type: 'public', isArchived: false },
      include: { _count: { select: { members: true } } },
      orderBy: { name: 'asc' },
    });
    const mine = new Set(
      (
        await this.prisma.channelMember.findMany({
          where: { userId },
          select: { channelId: true },
        })
      ).map((m) => m.channelId),
    );
    return channels.map((c) => ({
      id: c.id,
      name: c.name,
      topic: c.topic,
      memberCount: c._count.members,
      isMember: mine.has(c.id),
    }));
  }

  // ---------- Creation / joining ----------

  async create(userId: string, dto: CreateChannelRequest): Promise<ChannelSummary> {
    const membership = await this.prisma.workspaceMember.findFirst({ where: { userId } });
    if (!membership) throw new ForbiddenException('Not in a workspace');

    const name = dto.name.toLowerCase();
    const existing = await this.prisma.channel.findFirst({
      where: { workspaceId: membership.workspaceId, name },
    });
    if (existing) throw new ConflictException('A channel with that name already exists');

    const inviteeIds = Array.from(new Set(dto.memberIds ?? [])).filter((id) => id !== userId);
    if (inviteeIds.length > 0) {
      const count = await this.prisma.workspaceMember.count({
        where: { workspaceId: membership.workspaceId, userId: { in: inviteeIds } },
      });
      if (count !== inviteeIds.length) {
        throw new BadRequestException('All invitees must belong to the workspace');
      }
    }

    const channel = await this.prisma.channel.create({
      data: {
        workspaceId: membership.workspaceId,
        type: dto.type,
        name,
        topic: dto.topic,
        description: dto.description,
        createdById: userId,
        // Only the creator joins immediately; invitees get an invite to accept.
        members: { create: [{ userId }] },
      },
      include: memberInclude,
    });

    if (dto.type === 'public') {
      this.realtime.toWorkspace(membership.workspaceId, ServerEvents.ChannelCreated, {
        channel: this.toSummary(channel, userId),
      });
    }
    await this.inviteToChannel(channel.id, userId, inviteeIds);
    return this.toSummary(channel, userId);
  }

  /** Create pending invites for the given users and ring their inboxes. Skips
   * anyone already a member or already invited. Used by create + addMembers. */
  private async inviteToChannel(channelId: string, inviterId: string, inviteeIds: string[]) {
    if (inviteeIds.length === 0) return;
    const [existingMembers, existingInvites, channel, inviter] = await Promise.all([
      this.prisma.channelMember.findMany({
        where: { channelId, userId: { in: inviteeIds } },
        select: { userId: true },
      }),
      this.prisma.channelInvitation.findMany({
        where: { channelId, inviteeId: { in: inviteeIds } },
        select: { inviteeId: true },
      }),
      this.prisma.channel.findUniqueOrThrow({
        where: { id: channelId },
        select: { id: true, name: true, type: true, description: true, _count: { select: { members: true } } },
      }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: inviterId },
        select: { id: true, displayName: true, avatarUrl: true },
      }),
    ]);
    const skip = new Set([
      ...existingMembers.map((m) => m.userId),
      ...existingInvites.map((i) => i.inviteeId),
    ]);
    const fresh = inviteeIds.filter((id) => !skip.has(id));
    for (const inviteeId of fresh) {
      const invitation = await this.prisma.channelInvitation.create({
        data: { channelId, inviterId, inviteeId },
      });
      this.realtime.toUser(inviteeId, ServerEvents.ChannelInviteReceived, {
        invitation: {
          id: invitation.id,
          channel: {
            id: channel.id,
            name: channel.name,
            type: channel.type,
            description: channel.description,
            memberCount: channel._count.members,
          },
          inviter,
          createdAt: invitation.createdAt.toISOString(),
        },
      });
    }
  }

  async listInvitations(userId: string) {
    const rows = await this.prisma.channelInvitation.findMany({
      where: { inviteeId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        inviter: { select: { id: true, displayName: true, avatarUrl: true } },
        channel: {
          select: { id: true, name: true, type: true, description: true, _count: { select: { members: true } } },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      channel: {
        id: r.channel.id,
        name: r.channel.name,
        type: r.channel.type,
        description: r.channel.description,
        memberCount: r.channel._count.members,
      },
      inviter: r.inviter,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async acceptInvitation(invitationId: string, userId: string): Promise<ChannelSummary> {
    const invite = await this.prisma.channelInvitation.findUnique({ where: { id: invitationId } });
    if (!invite || invite.inviteeId !== userId) throw new NotFoundException('Invitation not found');
    await this.prisma.channelMember.upsert({
      where: { channelId_userId: { channelId: invite.channelId, userId } },
      update: {},
      create: { channelId: invite.channelId, userId },
    });
    await this.prisma.channelInvitation.delete({ where: { id: invitationId } });

    const channel = await this.prisma.channel.findUniqueOrThrow({
      where: { id: invite.channelId },
      include: memberInclude,
    });
    const summary = this.toSummary(channel, userId);
    this.realtime.toChannel(invite.channelId, ServerEvents.ChannelMemberJoined, {
      channelId: invite.channelId,
      userId,
    });
    this.realtime.toUser(userId, ServerEvents.ChannelCreated, { channel: summary });
    this.realtime.toUser(userId, ServerEvents.ChannelInviteResolved, { invitationId });
    return summary;
  }

  async declineInvitation(invitationId: string, userId: string): Promise<void> {
    const invite = await this.prisma.channelInvitation.findUnique({ where: { id: invitationId } });
    if (!invite || invite.inviteeId !== userId) throw new NotFoundException('Invitation not found');
    await this.prisma.channelInvitation.delete({ where: { id: invitationId } });
    this.realtime.toUser(userId, ServerEvents.ChannelInviteResolved, { invitationId });
  }

  async join(channelId: string, userId: string): Promise<ChannelSummary> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: memberInclude,
    });
    if (!channel || channel.isArchived) throw new NotFoundException('Channel not found');
    if (channel.type !== 'public') throw new ForbiddenException('Cannot join a private channel');

    await this.prisma.channelMember.upsert({
      where: { channelId_userId: { channelId, userId } },
      update: {},
      create: { channelId, userId },
    });

    this.realtime.toChannel(channelId, ServerEvents.ChannelMemberJoined, { channelId, userId });
    return this.toSummary(channel, userId);
  }

  /**
   * Find-or-create a DM / group DM. dm_key = sha256 of the sorted member ids
   * (including self) — guarantees exactly one conversation per member set.
   */
  async openDm(userId: string, memberIds: string[]): Promise<ChannelSummary> {
    const membership = await this.prisma.workspaceMember.findFirst({ where: { userId } });
    if (!membership) throw new ForbiddenException('Not in a workspace');

    const allIds = Array.from(new Set([userId, ...memberIds])).sort();
    if (allIds.length < 2) throw new ForbiddenException('A DM needs at least one other person');
    const dmKey = createHash('sha256').update(allIds.join(':')).digest('hex');

    const existing = await this.prisma.channel.findUnique({
      where: { dmKey },
      include: memberInclude,
    });
    if (existing) return this.toSummary(existing, userId);

    const memberCount = await this.prisma.workspaceMember.count({
      where: { workspaceId: membership.workspaceId, userId: { in: allIds } },
    });
    if (memberCount !== allIds.length) {
      throw new ForbiddenException('All DM members must belong to the workspace');
    }

    const channel = await this.prisma.channel.create({
      data: {
        workspaceId: membership.workspaceId,
        type: allIds.length === 2 ? 'dm' : 'group_dm',
        dmKey,
        createdById: userId,
        members: { create: allIds.map((id) => ({ userId: id })) },
      },
      include: memberInclude,
    });

    for (const id of allIds) {
      if (id !== userId) {
        this.realtime.toUser(id, ServerEvents.ChannelCreated, {
          channel: this.toSummary(channel, id),
        });
      }
    }
    return this.toSummary(channel, userId);
  }

  // ---------- Settings ----------

  async update(
    channelId: string,
    userId: string,
    dto: UpdateChannelRequest,
  ): Promise<ChannelSummary> {
    const channel = await this.requireManage(channelId, userId);
    if (channel.type === 'dm' || channel.type === 'group_dm') {
      throw new ForbiddenException('Direct messages have no channel settings');
    }
    if (channel.isDefault) {
      if (dto.isArchived) {
        throw new ForbiddenException('The default channel cannot be archived');
      }
      if (dto.type === 'private') {
        throw new ForbiddenException('The default channel cannot be made private');
      }
    }

    let name: string | undefined;
    if (dto.name && dto.name.toLowerCase() !== channel.name) {
      name = dto.name.toLowerCase();
      const dup = await this.prisma.channel.findFirst({
        where: { workspaceId: channel.workspaceId, name, id: { not: channelId } },
      });
      if (dup) throw new ConflictException('A channel with that name already exists');
    }

    const wasPublic = channel.type === 'public';
    const updated = await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(dto.topic !== undefined ? { topic: dto.topic } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.postingPolicy !== undefined ? { postingPolicy: dto.postingPolicy } : {}),
        ...(dto.isArchived !== undefined ? { isArchived: dto.isArchived } : {}),
      },
      include: memberInclude,
    });

    const summary = this.toSummary(updated, userId);
    this.realtime.toChannel(channelId, ServerEvents.ChannelUpdated, { channel: summary });
    if (wasPublic || updated.type === 'public') {
      this.realtime.toWorkspace(channel.workspaceId, ServerEvents.ChannelUpdated, {
        channel: summary,
      });
    }
    return summary;
  }

  // ---------- Members ----------

  async listMembers(channelId: string, userId: string): Promise<ChannelMemberDto[]> {
    await this.requireMembership(channelId, userId);
    const channel = await this.prisma.channel.findUniqueOrThrow({
      where: { id: channelId },
      include: memberInclude,
    });
    const roles = await this.prisma.workspaceMember.findMany({
      where: {
        workspaceId: channel.workspaceId,
        userId: { in: channel.members.map((m) => m.userId) },
      },
    });
    const roleByUser = new Map(roles.map((r) => [r.userId, r.role]));
    return channel.members
      .map((m) => ({
        id: m.user.id,
        displayName: m.user.displayName,
        avatarUrl: m.user.avatarUrl,
        workspaceRole: roleByUser.get(m.userId) ?? ('member' as const),
        joinedAt: m.joinedAt.toISOString(),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  /** Any existing member may add people (Slack behavior). */
  async addMembers(channelId: string, userId: string, userIds: string[]) {
    await this.requireMembership(channelId, userId);
    const channel = await this.prisma.channel.findUniqueOrThrow({
      where: { id: channelId },
      include: memberInclude,
    });
    if (channel.type === 'dm' || channel.type === 'group_dm') {
      throw new ForbiddenException('Start a new group DM to add people to a conversation');
    }
    if (channel.isArchived) throw new ForbiddenException('This channel is archived');

    const targets = Array.from(new Set(userIds));
    const wsCount = await this.prisma.workspaceMember.count({
      where: { workspaceId: channel.workspaceId, userId: { in: targets } },
    });
    if (wsCount !== targets.length) {
      throw new BadRequestException('All added users must belong to the workspace');
    }

    // Send invites the targets must accept, rather than adding them outright.
    await this.inviteToChannel(channelId, userId, targets);
    return [];
  }

  /**
   * Post a system notice (rendered as a centered event line) authored by the
   * relevant user. Inserted directly to avoid a Messages↔Channels cycle and
   * to bypass posting-policy gates.
   */
  private async postSystemMessage(channelId: string, authorId: string, content: string) {
    const author = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: { id: true, displayName: true, avatarUrl: true },
    });
    if (!author) return;
    const created = await this.prisma.message.create({
      data: { channelId, userId: authorId, content, clientMsgId: randomUUID() },
    });
    await this.prisma.channel.update({
      where: { id: channelId },
      data: { lastMessageAt: created.createdAt },
    });
    this.realtime.toChannel(channelId, ServerEvents.MessageNew, {
      message: {
        id: created.id,
        channelId,
        parentMessageId: null,
        content,
        clientMsgId: created.clientMsgId,
        author,
        replyCount: 0,
        isEdited: false,
        isDeleted: false,
        isPinned: false,
        reactions: [],
        attachments: [],
        lastReplyAt: null,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    });
  }

  /** Self = leave (always allowed); removing others requires manage rights. */
  async removeMember(channelId: string, actorId: string, targetUserId: string): Promise<void> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: memberInclude,
    });
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.type === 'dm' || channel.type === 'group_dm') {
      throw new ForbiddenException('You cannot leave a direct message conversation');
    }
    if (channel.isDefault) {
      throw new ForbiddenException('Everyone belongs to the default channel');
    }
    await this.requireMembership(channelId, targetUserId);
    if (actorId !== targetUserId && !(await this.canManageChannel(channel, actorId))) {
      throw new ForbiddenException('Only the channel creator or a workspace admin can remove members');
    }

    await this.prisma.channelMember.delete({
      where: { channelId_userId: { channelId, userId: targetUserId } },
    });

    // Announce the departure in-channel, before evicting the target's socket.
    const selfLeave = actorId === targetUserId;
    await this.postSystemMessage(
      channelId,
      targetUserId,
      selfLeave ? 'left the channel' : 'was removed from the channel',
    ).catch(() => undefined);

    this.realtime.toChannel(channelId, ServerEvents.ChannelMemberLeft, {
      channelId,
      userId: targetUserId,
    });
    this.realtime.toUser(targetUserId, ServerEvents.ChannelRemoved, { channelId });
    this.realtime.evictFromChannel(targetUserId, channelId);
    void this.notifications.clearForChannel(targetUserId, channelId).catch(() => undefined);
  }

  // ---------- Invite links ----------

  private static readonly INVITE_TTL_DAYS = 7;

  /** Any member can mint a shareable join link. Reuses the active one. */
  async getOrCreateInviteLink(channelId: string, userId: string): Promise<InviteLinkResponse> {
    await this.requireMembership(channelId, userId);
    const channel = await this.prisma.channel.findUniqueOrThrow({ where: { id: channelId } });
    if (channel.type === 'dm' || channel.type === 'group_dm') {
      throw new ForbiddenException('Direct messages cannot have invite links');
    }
    if (channel.isArchived) throw new ForbiddenException('This channel is archived');

    const existing = await this.prisma.channelInvite.findFirst({
      where: { channelId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return { token: existing.token, expiresAt: existing.expiresAt.toISOString() };
    }

    const invite = await this.prisma.channelInvite.create({
      data: {
        channelId,
        createdById: userId,
        token: randomBytes(24).toString('base64url'),
        expiresAt: new Date(Date.now() + ChannelsService.INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    return { token: invite.token, expiresAt: invite.expiresAt.toISOString() };
  }

  private async findValidInvite(token: string) {
    const invite = await this.prisma.channelInvite.findUnique({
      where: { token },
      include: {
        channel: { include: { _count: { select: { members: true } } } },
        createdBy: { select: { displayName: true } },
      },
    });
    if (!invite) throw new NotFoundException('This invite link is invalid');
    if (invite.revokedAt || invite.expiresAt < new Date() || invite.channel.isArchived) {
      throw new GoneException('This invite link has expired');
    }
    return invite;
  }

  async previewInvite(token: string, userId: string): Promise<InvitePreview> {
    const invite = await this.findValidInvite(token);
    const membership = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId: invite.channelId, userId } },
    });
    return {
      channelId: invite.channelId,
      name: invite.channel.name,
      type: invite.channel.type,
      topic: invite.channel.topic,
      memberCount: invite.channel._count.members,
      invitedBy: invite.createdBy.displayName,
      alreadyMember: membership !== null,
    };
  }

  /** The token itself is the authorization — works for private channels. */
  async acceptInvite(token: string, userId: string): Promise<ChannelSummary> {
    const invite = await this.findValidInvite(token);
    const workspaceMember = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: invite.channel.workspaceId, userId },
      },
    });
    if (!workspaceMember) throw new ForbiddenException('You are not in this workspace');

    await this.prisma.channelMember.upsert({
      where: { channelId_userId: { channelId: invite.channelId, userId } },
      update: {},
      create: { channelId: invite.channelId, userId },
    });

    const fresh = await this.prisma.channel.findUniqueOrThrow({
      where: { id: invite.channelId },
      include: memberInclude,
    });
    const joined = await this.listMembers(invite.channelId, userId);
    this.realtime.toChannel(invite.channelId, ServerEvents.ChannelMemberJoined, {
      channelId: invite.channelId,
      users: joined.filter((m) => m.id === userId),
    });
    return this.toSummary(fresh, userId);
  }

  // ---------- Personal preferences ----------

  async updateMySettings(
    channelId: string,
    userId: string,
    dto: MyChannelSettingsRequest,
  ): Promise<ChannelSummary> {
    await this.requireMembership(channelId, userId);
    await this.prisma.channelMember.update({
      where: { channelId_userId: { channelId, userId } },
      data: {
        ...(dto.notifyLevel !== undefined ? { notifyLevel: dto.notifyLevel } : {}),
        ...(dto.isStarred !== undefined ? { isStarred: dto.isStarred } : {}),
      },
    });
    const fresh = await this.prisma.channel.findUniqueOrThrow({
      where: { id: channelId },
      include: memberInclude,
    });
    const summary = this.toSummary(fresh, userId);
    // Echo to the user's own room so other tabs/devices sync.
    this.realtime.toUser(userId, ServerEvents.ChannelUpdated, { channel: summary });
    return summary;
  }
}
