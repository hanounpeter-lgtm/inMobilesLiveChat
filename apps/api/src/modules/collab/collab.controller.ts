import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  BroadcastRequest,
  CreateEventRequest,
  CreatePollRequest,
  CreateTaskRequest,
  CreateTemplateRequest,
  UpdateNoteRequest,
  UpdateTaskRequest,
} from '@inmobiles/shared-types';
import { CurrentUserId } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PollsService } from './polls.service';
import { TemplatesService } from './templates.service';
import { TasksService } from './tasks.service';
import { NotesService } from './notes.service';
import { CalendarService } from './calendar.service';
import { AdminService } from './admin.service';
import { FilesHubService } from './fileshub.service';
import { BroadcastService } from './broadcast.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class CollabController {
  constructor(
    private readonly polls: PollsService,
    private readonly templates: TemplatesService,
    private readonly tasks: TasksService,
    private readonly notes: NotesService,
    private readonly calendar: CalendarService,
    private readonly admin: AdminService,
    private readonly filesHub: FilesHubService,
    private readonly broadcastSvc: BroadcastService,
  ) {}

  @Post('broadcast')
  broadcast(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(BroadcastRequest)) body: BroadcastRequest,
  ) {
    return this.broadcastSvc.broadcast(userId, body.channelIds, body.text);
  }

  // ---- Polls ----
  @Post('channels/:id/polls')
  createPoll(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) channelId: string,
    @Body(new ZodValidationPipe(CreatePollRequest)) body: CreatePollRequest,
  ) {
    return this.polls.create(channelId, userId, body);
  }

  @Get('polls/:id')
  getPoll(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.polls.getPoll(id, userId);
  }

  @Post('polls/:id/vote')
  vote(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(z.object({ optionId: z.string().uuid() }))) body: { optionId: string },
  ) {
    return this.polls.vote(id, userId, body.optionId);
  }

  // ---- Templates ----
  @Get('templates')
  async listTemplates(@CurrentUserId() userId: string) {
    return { templates: await this.templates.list(userId) };
  }

  @Post('templates')
  createTemplate(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(CreateTemplateRequest)) body: CreateTemplateRequest,
  ) {
    return this.templates.create(userId, body);
  }

  @Delete('templates/:id')
  @HttpCode(204)
  async removeTemplate(@CurrentUserId() userId: string, @Param('id') id: string) {
    await this.templates.remove(userId, id);
  }

  // ---- Tasks ----
  @Get('me/tasks')
  async myTasks(@CurrentUserId() userId: string) {
    return { tasks: await this.tasks.listMine(userId) };
  }

  @Get('channels/:id/tasks')
  async channelTasks(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) channelId: string) {
    return { tasks: await this.tasks.listChannel(channelId, userId) };
  }

  @Post('tasks')
  createTask(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(CreateTaskRequest)) body: CreateTaskRequest,
  ) {
    return this.tasks.create(userId, body);
  }

  @Patch('tasks/:id')
  updateTask(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateTaskRequest)) body: UpdateTaskRequest,
  ) {
    return this.tasks.update(id, userId, body);
  }

  @Delete('tasks/:id')
  @HttpCode(204)
  async removeTask(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.tasks.remove(id, userId);
  }

  // ---- Notes ----
  @Get('channels/:id/note')
  getNote(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) channelId: string) {
    return this.notes.get(channelId, userId);
  }

  @Patch('channels/:id/note')
  updateNote(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) channelId: string,
    @Body(new ZodValidationPipe(UpdateNoteRequest)) body: UpdateNoteRequest,
  ) {
    return this.notes.update(channelId, userId, body);
  }

  // ---- Calendar ----
  @Get('calendar/events')
  async events(@CurrentUserId() userId: string) {
    return { events: await this.calendar.list(userId) };
  }

  @Post('calendar/events')
  createEvent(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(CreateEventRequest)) body: CreateEventRequest,
  ) {
    return this.calendar.create(userId, body);
  }

  @Post('calendar/events/:id/respond')
  respond(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(z.object({ status: z.enum(['accepted', 'declined']) })))
    body: { status: 'accepted' | 'declined' },
  ) {
    return this.calendar.respond(id, userId, body.status);
  }

  @Delete('calendar/events/:id')
  @HttpCode(204)
  async removeEvent(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.calendar.remove(id, userId);
  }

  // ---- Files hub ----
  @Get('files/hub')
  async hub(
    @CurrentUserId() userId: string,
    @Query('q') q?: string,
    @Query('type') type?: string,
  ) {
    return { files: await this.filesHub.list(userId, q, type) };
  }

  // ---- Admin ----
  @Get('admin/stats')
  adminStats(@CurrentUserId() userId: string) {
    return this.admin.stats(userId);
  }

  @Get('admin/users')
  async adminUsers(@CurrentUserId() userId: string) {
    return { users: await this.admin.listUsers(userId) };
  }

  @Patch('admin/users/:id/role')
  @HttpCode(204)
  async setRole(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(z.object({ role: z.enum(['admin', 'member']) }))) body: { role: 'admin' | 'member' },
  ) {
    await this.admin.setRole(userId, id, body.role);
  }

  @Patch('admin/users/:id/active')
  @HttpCode(204)
  async setActive(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(z.object({ active: z.boolean() }))) body: { active: boolean },
  ) {
    await this.admin.setActive(userId, id, body.active);
  }

  @Delete('admin/messages/:id')
  @HttpCode(204)
  async moderateMessage(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.admin.deleteMessage(userId, id);
  }
}
