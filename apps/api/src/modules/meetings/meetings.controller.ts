import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ScheduleMeetingRequest } from '@inmobiles/shared-types';
import { CurrentUserId } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MeetingsService } from './meetings.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get('channels/:channelId/meetings')
  async list(
    @CurrentUserId() userId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
  ) {
    return { meetings: await this.meetings.list(channelId, userId) };
  }

  @Post('channels/:channelId/meetings')
  create(
    @CurrentUserId() userId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Body(new ZodValidationPipe(ScheduleMeetingRequest)) body: ScheduleMeetingRequest,
  ) {
    return this.meetings.create(channelId, userId, body);
  }

  @Get('meetings/by-code/:code')
  joinByCode(@CurrentUserId() userId: string, @Param('code') code: string) {
    return this.meetings.joinByCode(code, userId);
  }

  @Delete('meetings/:id')
  @HttpCode(204)
  async cancel(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.meetings.cancel(id, userId);
  }
}
