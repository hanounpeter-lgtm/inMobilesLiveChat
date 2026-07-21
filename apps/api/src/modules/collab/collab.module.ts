import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChannelsModule } from '../channels/channels.module';
import { MessagesModule } from '../messages/messages.module';
import { CollabController } from './collab.controller';
import { PollsService } from './polls.service';
import { TemplatesService } from './templates.service';
import { TasksService } from './tasks.service';
import { NotesService } from './notes.service';
import { CalendarService } from './calendar.service';
import { AdminService } from './admin.service';
import { FilesHubService } from './fileshub.service';

@Module({
  imports: [AuthModule, ChannelsModule, MessagesModule],
  controllers: [CollabController],
  providers: [
    PollsService,
    TemplatesService,
    TasksService,
    NotesService,
    CalendarService,
    AdminService,
    FilesHubService,
  ],
})
export class CollabModule {}
