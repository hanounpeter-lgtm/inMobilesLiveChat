import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChannelsController, InvitesController } from './channels.controller';
import { ChannelsService } from './channels.service';

@Module({
  imports: [AuthModule],
  controllers: [ChannelsController, InvitesController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
