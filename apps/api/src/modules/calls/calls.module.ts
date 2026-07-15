import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChannelsModule } from '../channels/channels.module';
import { FilesModule } from '../files/files.module';
import { MessagesModule } from '../messages/messages.module';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';

@Module({
  imports: [AuthModule, ChannelsModule, MessagesModule, FilesModule],
  controllers: [CallsController],
  providers: [CallsService],
})
export class CallsModule {}
