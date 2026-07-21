import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  ChannelsController,
  InvitesController,
  InvitationsController,
} from './channels.controller';
import { ChannelsService } from './channels.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ChannelsController, InvitesController, InvitationsController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
