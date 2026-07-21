import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AddChannelMembersRequest,
  CreateChannelRequest,
  CreateDmRequest,
  MyChannelSettingsRequest,
  UpdateChannelRequest,
} from '@inmobiles/shared-types';
import { CurrentUserId } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChannelsService } from './channels.service';

@Controller('channels')
@UseGuards(JwtAuthGuard)
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get()
  async listMine(@CurrentUserId() userId: string) {
    return { channels: await this.channels.listMine(userId) };
  }

  @Get('browse')
  async browse(@CurrentUserId() userId: string) {
    return { channels: await this.channels.browsePublic(userId) };
  }

  @Post()
  create(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(CreateChannelRequest)) body: CreateChannelRequest,
  ) {
    return this.channels.create(userId, body);
  }

  @Post('dm')
  openDm(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(CreateDmRequest)) body: CreateDmRequest,
  ) {
    return this.channels.openDm(userId, body.memberIds);
  }

  @Post(':id/join')
  join(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) channelId: string) {
    return this.channels.join(channelId, userId);
  }

  @Patch(':id')
  update(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) channelId: string,
    @Body(new ZodValidationPipe(UpdateChannelRequest)) body: UpdateChannelRequest,
  ) {
    return this.channels.update(channelId, userId, body);
  }

  @Get(':id/members')
  async members(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) channelId: string) {
    return { members: await this.channels.listMembers(channelId, userId) };
  }

  @Post(':id/members')
  async addMembers(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) channelId: string,
    @Body(new ZodValidationPipe(AddChannelMembersRequest)) body: AddChannelMembersRequest,
  ) {
    return { members: await this.channels.addMembers(channelId, userId, body.userIds) };
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  removeMember(
    @CurrentUserId() actorId: string,
    @Param('id', ParseUUIDPipe) channelId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ) {
    return this.channels.removeMember(channelId, actorId, targetUserId);
  }

  @Patch(':id/my-settings')
  updateMySettings(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) channelId: string,
    @Body(new ZodValidationPipe(MyChannelSettingsRequest)) body: MyChannelSettingsRequest,
  ) {
    return this.channels.updateMySettings(channelId, userId, body);
  }

  @Post(':id/invite-link')
  inviteLink(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) channelId: string) {
    return this.channels.getOrCreateInviteLink(channelId, userId);
  }
}

@Controller('invites')
@UseGuards(JwtAuthGuard)
export class InvitesController {
  constructor(private readonly channels: ChannelsService) {}

  @Get(':token')
  preview(@CurrentUserId() userId: string, @Param('token') token: string) {
    return this.channels.previewInvite(token, userId);
  }

  @Post(':token/accept')
  accept(@CurrentUserId() userId: string, @Param('token') token: string) {
    return this.channels.acceptInvite(token, userId);
  }
}

/** Channel invitation inbox — pending invites the user can accept or decline. */
@Controller()
@UseGuards(JwtAuthGuard)
export class InvitationsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get('me/invitations')
  async list(@CurrentUserId() userId: string) {
    return { invitations: await this.channels.listInvitations(userId) };
  }

  @Post('invitations/:id/accept')
  acceptInvitation(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.channels.acceptInvitation(id, userId);
  }

  @Post('invitations/:id/decline')
  @HttpCode(204)
  async declineInvitation(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.channels.declineInvitation(id, userId);
  }
}
