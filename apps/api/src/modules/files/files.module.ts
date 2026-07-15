import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChannelsModule } from '../channels/channels.module';
import { FilesController } from './files.controller';
import { S3Service } from './s3.service';

@Module({
  imports: [AuthModule, ChannelsModule],
  controllers: [FilesController],
  providers: [S3Service],
  exports: [S3Service],
})
export class FilesModule {}
