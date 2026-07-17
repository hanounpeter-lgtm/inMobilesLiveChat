import { BadRequestException, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ClockAction } from '@inmobiles/shared-types';
import { CurrentUserId } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TimeclockService } from './timeclock.service';

@Controller('timeclock')
@UseGuards(JwtAuthGuard)
export class TimeclockController {
  constructor(private readonly timeclock: TimeclockService) {}

  @Get('me')
  me(@CurrentUserId() userId: string) {
    return this.timeclock.me(userId);
  }

  @Get('team')
  async team(@CurrentUserId() userId: string) {
    return { team: await this.timeclock.team(userId) };
  }

  @Post(':action')
  act(@CurrentUserId() userId: string, @Param('action') action: string) {
    const parsed = ClockAction.safeParse(action);
    if (!parsed.success) throw new BadRequestException('Unknown action');
    return this.timeclock.act(userId, parsed.data);
  }
}
