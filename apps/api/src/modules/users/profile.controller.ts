import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { UpdateProfileRequest, ServerEvents } from '@inmobiles/shared-types';
import { CurrentUserId } from '../../common/current-user.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../gateway/realtime.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { S3Service } from '../files/s3.service';

const MAX_AVATAR = 5 * 1024 * 1024;

@Controller()
export class ProfileController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly realtime: RealtimeService,
  ) {}

  private async broadcast(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        statusText: true,
        department: true,
        jobTitle: true,
      },
    });
    const memberships = await this.prisma.workspaceMember.findMany({ where: { userId } });
    for (const m of memberships) {
      this.realtime.toWorkspace(m.workspaceId, ServerEvents.UserUpdated, { user });
    }
    return user;
  }

  @Patch('users/me')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(UpdateProfileRequest)) body: UpdateProfileRequest,
  ) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(body.displayName !== undefined ? { displayName: body.displayName.trim() } : {}),
        ...(body.statusText !== undefined ? { statusText: body.statusText?.trim() || null } : {}),
        ...(body.department !== undefined ? { department: body.department?.trim() || null } : {}),
        ...(body.jobTitle !== undefined ? { jobTitle: body.jobTitle?.trim() || null } : {}),
      },
    });
    return this.broadcast(userId);
  }

  @Post('users/me/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_AVATAR } }))
  async uploadAvatar(@CurrentUserId() userId: string, @UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('Empty image');
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Avatar must be an image');
    }
    // One key per user — overwrites; the ?v= timestamp busts caches.
    await this.s3.putObject(`avatars/${userId}`, file.buffer, file.mimetype);
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: `/api/avatars/${userId}?v=${Date.now()}` },
    });
    return this.broadcast(userId);
  }

  @Delete('users/me/avatar')
  @UseGuards(JwtAuthGuard)
  async removeAvatar(@CurrentUserId() userId: string) {
    await this.s3.deleteObject(`avatars/${userId}`).catch(() => undefined);
    await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } });
    return this.broadcast(userId);
  }

  /** Public image stream — avatars render in <img> tags which can't carry
   * bearer tokens. Low sensitivity; keyed by user id, cached briefly. */
  @Get('avatars/:userId')
  async avatar(@Param('userId', ParseUUIDPipe) userId: string, @Res() res: Response) {
    try {
      const obj = await this.s3.getObject(`avatars/${userId}`);
      res.setHeader('Content-Type', obj.contentType);
      res.setHeader('Cache-Control', 'public, max-age=300');
      obj.body.pipe(res);
    } catch {
      throw new NotFoundException('No avatar');
    }
  }
}
