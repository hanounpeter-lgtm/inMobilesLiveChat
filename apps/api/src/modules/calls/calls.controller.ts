import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { StartCallRequest } from '@inmobiles/shared-types';
import { CurrentUserId } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CallsService } from './calls.service';

const LeaveCallRequest = z.object({
  remainingParticipants: z.number().int().min(0),
});

@Controller()
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Get('channels/:channelId/call')
  async active(
    @CurrentUserId() userId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
  ) {
    return { call: await this.calls.getActive(channelId, userId) };
  }

  @Post('channels/:channelId/call')
  startOrJoin(
    @CurrentUserId() userId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Body(new ZodValidationPipe(StartCallRequest)) body: StartCallRequest,
  ) {
    return this.calls.startOrJoin(channelId, userId, body.type);
  }

  @Post('calls/:id/leave')
  @HttpCode(204)
  async leave(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) callId: string,
    @Body(new ZodValidationPipe(LeaveCallRequest)) body: { remainingParticipants: number },
  ) {
    await this.calls.leave(callId, userId, body.remainingParticipants);
  }

  @Post('calls/:id/recording/start')
  startRecording(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) callId: string) {
    return this.calls.setRecording(callId, userId, true);
  }

  @Post('calls/:id/recording/stop')
  stopRecording(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) callId: string) {
    return this.calls.setRecording(callId, userId, false);
  }

  @Post('calls/:id/recording/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 200 * 1024 * 1024 } }))
  uploadRecording(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) callId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.calls.uploadRecording(callId, userId, file);
  }
}
