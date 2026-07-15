import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EditMessageRequest, SendMessageRequest } from '@inmobiles/shared-types';
import { CurrentUserId } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessagesService } from './messages.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post('channels/:channelId/messages')
  send(
    @CurrentUserId() userId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Body(new ZodValidationPipe(SendMessageRequest)) body: SendMessageRequest,
  ) {
    return this.messages.send(channelId, userId, body);
  }

  @Get('channels/:channelId/messages')
  list(
    @CurrentUserId() userId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.messages.list(channelId, userId, cursor);
  }

  @Get('messages/:id/thread')
  async thread(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { messages: await this.messages.listThread(id, userId) };
  }

  @Patch('messages/:id')
  edit(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(EditMessageRequest)) body: EditMessageRequest,
  ) {
    return this.messages.edit(id, userId, body.content);
  }

  @Delete('messages/:id')
  @HttpCode(204)
  remove(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.messages.remove(id, userId);
  }
}
