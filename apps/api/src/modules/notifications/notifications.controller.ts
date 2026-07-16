import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { MarkReadRequest } from '@inmobiles/shared-types';
import { CurrentUserId } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('me/unreads')
  async unreads(@CurrentUserId() userId: string) {
    return { unreads: await this.notifications.getUnreads(userId) };
  }

  @Post('channels/:id/read')
  markRead(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) channelId: string,
    @Body(new ZodValidationPipe(MarkReadRequest)) body: MarkReadRequest,
  ) {
    return this.notifications.markRead(channelId, userId, body.messageId);
  }

  @Get('me/notifications')
  async list(@CurrentUserId() userId: string) {
    return { notifications: await this.notifications.listMine(userId) };
  }
}
