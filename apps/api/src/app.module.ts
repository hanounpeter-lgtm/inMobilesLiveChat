import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { MessagesModule } from './modules/messages/messages.module';
import { CallsModule } from './modules/calls/calls.module';
import { MeetingsModule } from './modules/meetings/meetings.module';
import { FilesModule } from './modules/files/files.module';
import { GifsModule } from './modules/gifs/gifs.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { TimeclockModule } from './modules/timeclock/timeclock.module';
import { SearchModule } from './modules/search/search.module';
import { GatewayModule } from './gateway/gateway.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Root .env is shared by the whole monorepo.
      envFilePath: ['../../.env', '.env'],
    }),
    PrismaModule,
    RedisModule,
    GatewayModule,
    AuthModule,
    UsersModule,
    ChannelsModule,
    MessagesModule,
    CallsModule,
    MeetingsModule,
    FilesModule,
    GifsModule,
    WorkspacesModule,
    NotificationsModule,
    SearchModule,
    TimeclockModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
