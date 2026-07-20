import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { FileUrlResponse } from '@inmobiles/shared-types';
import { CurrentUserId } from '../../common/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChannelsService } from '../channels/channels.service';
import { S3Service } from './s3.service';

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly channels: ChannelsService,
  ) {}

  private async authorize(attachmentId: string, userId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { message: { select: { channelId: true } } },
    });
    if (!attachment || attachment.status !== 'ready' || !attachment.message) {
      throw new NotFoundException('File not found');
    }
    await this.channels.requireMembership(attachment.message.channelId, userId);
    return attachment;
  }

  /** Short-lived presigned URL, gated on channel membership. (Kept for
   * direct-download setups; the app streams via /raw so no MinIO port is
   * exposed to the browser.) */
  @Get(':id/url')
  async url(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) attachmentId: string,
  ): Promise<FileUrlResponse> {
    const attachment = await this.authorize(attachmentId, userId);
    return { url: await this.s3.presignGet(attachment.s3Key) };
  }

  /** Stream the file bytes through the API (membership-checked), so images,
   * voice notes, recordings, and downloads all ride the same origin/port. */
  @Get(':id/raw')
  async raw(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) attachmentId: string,
    @Res() res: Response,
  ) {
    const attachment = await this.authorize(attachmentId, userId);
    const obj = await this.s3.getObject(attachment.s3Key);
    res.setHeader('Content-Type', obj.contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    obj.body.pipe(res);
  }
}
