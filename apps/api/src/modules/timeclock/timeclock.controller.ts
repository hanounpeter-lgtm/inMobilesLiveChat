import { BadRequestException, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
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

  @Get('history')
  history(
    @CurrentUserId() userId: string,
    @Query('userId') targetUserId?: string,
    @Query('days') daysRaw?: string,
  ) {
    const days = Math.min(60, Math.max(1, Number(daysRaw) || 14));
    return this.timeclock.history(userId, targetUserId || userId, days);
  }

  @Post(':action')
  act(@CurrentUserId() userId: string, @Param('action') action: string) {
    const parsed = ClockAction.safeParse(action);
    if (!parsed.success) throw new BadRequestException('Unknown action');
    return this.timeclock.act(userId, parsed.data);
  }
}
