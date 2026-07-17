import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { ProfileController } from './profile.controller';
import { UsersController } from './users.controller';

@Module({
  imports: [AuthModule, FilesModule],
  controllers: [UsersController, ProfileController],
})
export class UsersModule {}
