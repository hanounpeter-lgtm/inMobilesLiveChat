import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  AcceptSignupRequest,
  CreateWorkspaceInvitesRequest,
  LoginResponse,
} from '@inmobiles/shared-types';
import { CurrentUserId } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceInvitesService } from './workspace-invites.service';

@Controller('workspace/invites')
@UseGuards(JwtAuthGuard)
export class WorkspaceInvitesController {
  constructor(private readonly invites: WorkspaceInvitesService) {}

  @Post()
  create(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(CreateWorkspaceInvitesRequest))
    body: CreateWorkspaceInvitesRequest,
  ) {
    return this.invites.create(userId, body.emails, body.role);
  }

  @Get()
  async list(@CurrentUserId() userId: string) {
    return { invites: await this.invites.listPending(userId) };
  }

  @Delete(':id')
  @HttpCode(204)
  revoke(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) inviteId: string) {
    return this.invites.revoke(userId, inviteId);
  }
}

/** Public — the invitee has no account yet. */
@Controller('signup')
export class SignupController {
  constructor(private readonly invites: WorkspaceInvitesService) {}

  @Get(':token')
  preview(@Param('token') token: string) {
    return this.invites.preview(token);
  }

  @Post(':token')
  @HttpCode(200)
  async accept(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(AcceptSignupRequest)) body: AcceptSignupRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const result = await this.invites.accept(token, body, req.headers['user-agent']);
    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.COOKIE_SECURE === 'true',
      path: '/api/auth',
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });
    return { accessToken: result.accessToken, user: result.user };
  }
}
