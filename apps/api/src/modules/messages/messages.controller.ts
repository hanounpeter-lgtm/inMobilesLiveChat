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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  EditMessageRequest,
  ForwardMessageRequest,
  SendMessageRequest,
  ToggleReactionRequest,
} from '@inmobiles/shared-types';
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

  @Post('channels/:channelId/voice-notes')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  sendVoiceNote(
    @CurrentUserId() userId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.messages.sendVoiceNote(channelId, userId, file);
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
  thread(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.messages.listThread(id, userId);
  }

  @Get('channels/:channelId/pins')
  async pins(
    @CurrentUserId() userId: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
  ) {
    return { messages: await this.messages.listPins(channelId, userId) };
  }

  @Get('me/saved')
  async saved(@CurrentUserId() userId: string) {
    return { messages: await this.messages.listSaved(userId) };
  }

  @Post('messages/:id/forward')
  forward(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ForwardMessageRequest)) body: ForwardMessageRequest,
  ) {
    return this.messages.forward(id, userId, body.channelId);
  }

  @Post('messages/:id/save')
  save(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.messages.saveMessage(id, userId);
  }

  @Delete('messages/:id/save')
  unsave(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.messages.unsaveMessage(id, userId);
  }

  @Post('messages/:id/reactions')
  toggleReaction(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ToggleReactionRequest)) body: ToggleReactionRequest,
  ) {
    return this.messages.toggleReaction(id, userId, body.emoji);
  }

  @Post('messages/:id/pin')
  togglePin(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.messages.togglePin(id, userId);
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
