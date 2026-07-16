import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { MessagesModule } from './modules/messages/messages.module';
import { CallsModule } from './modules/calls/calls.module';
import { FilesModule } from './modules/files/files.module';
import { GifsModule } from './modules/gifs/gifs.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
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
    FilesModule,
    GifsModule,
    WorkspacesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
