import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
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

  /** Short-lived presigned URL, gated on channel membership. */
  @Get(':id/url')
  async url(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) attachmentId: string,
  ): Promise<FileUrlResponse> {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { message: { select: { channelId: true } } },
    });
    if (!attachment || attachment.status !== 'ready' || !attachment.message) {
      throw new NotFoundException('File not found');
    }
    await this.channels.requireMembership(attachment.message.channelId, userId);
    return { url: await this.s3.presignGet(attachment.s3Key) };
  }
}
