import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TimeclockController } from './timeclock.controller';
import { TimeclockService } from './timeclock.service';

@Module({
  imports: [AuthModule],
  controllers: [TimeclockController],
  providers: [TimeclockService],
})
export class TimeclockModule {}
