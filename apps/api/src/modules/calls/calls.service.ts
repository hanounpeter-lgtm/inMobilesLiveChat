import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';
import { randomUUID } from 'crypto';
import type { CallDto, JoinCallResponse } from '@inmobiles/shared-types';
import { ServerEvents } from '@inmobiles/shared-types';
import type { Call, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../gateway/realtime.service';
import { ChannelsService } from '../channels/channels.service';
import { MessagesService } from '../messages/messages.service';
import { S3Service } from '../files/s3.service';

type CallWithStarter = Call & { startedBy: Pick<User, 'id' | 'displayName'> };

@Injectable()
export class CallsService {
  private readonly livekitUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly channels: ChannelsService,
    private readonly messages: MessagesService,
    private readonly s3: S3Service,
    config: ConfigService,
  ) {
    this.livekitUrl = config.get<string>('LIVEKIT_URL', 'ws://localhost:7880');
    this.apiKey = config.get<string>('LIVEKIT_API_KEY', 'devkey');
    this.apiSecret = config.get<string>('LIVEKIT_API_SECRET', 'secret');
  }

  private toDto(call: CallWithStarter): CallDto {
    return {
      id: call.id,
      channelId: call.channelId,
      type: call.type,
      startedBy: { id: call.startedBy.id, displayName: call.startedBy.displayName },
      startedAt: call.startedAt.toISOString(),
      isRecording: call.isRecording,
    };
  }

  private async mintToken(call: Call, userId: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: user.id,
      name: user.displayName,
      ttl: '2h',
    });
    token.addGrant({
      room: call.livekitRoom,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });
    return token.toJwt();
  }

  async getActive(channelId: string, userId: string): Promise<CallDto | null> {
    await this.channels.requireMembership(channelId, userId);
    const call = await this.prisma.call.findFirst({
      where: { channelId, endedAt: null },
      include: { startedBy: { select: { id: true, displayName: true } } },
    });
    return call ? this.toDto(call) : null;
  }

  /** Start a call in the channel, or join the one already in progress. */
  async startOrJoin(
    channelId: string,
    userId: string,
    type: 'audio' | 'video',
  ): Promise<JoinCallResponse> {
    await this.channels.requireMembership(channelId, userId);

    let call = await this.prisma.call.findFirst({
      where: { channelId, endedAt: null },
      include: { startedBy: { select: { id: true, displayName: true } } },
    });

    if (!call) {
      call = await this.prisma.call.create({
        data: {
          channelId,
          startedById: userId,
          type,
          livekitRoom: `call-${channelId}-${randomUUID()}`,
        },
        include: { startedBy: { select: { id: true, displayName: true } } },
      });
      const dto = this.toDto(call);
      this.realtime.toChannel(channelId, ServerEvents.CallStarted, { call: dto });
      await this.messages.send(channelId, userId, {
        content: type === 'video' ? 'Started a video call' : 'Started a call',
        clientMsgId: randomUUID(),
      });
    }

    return {
      call: this.toDto(call),
      token: await this.mintToken(call, userId),
      serverUrl: this.livekitUrl,
    };
  }

  /**
   * Called when a participant leaves. The leaver reports how many others were
   * still in the LiveKit room; when zero, the call ends. (Server-side webhook
   * cleanup replaces this in a later phase.)
   */
  async leave(callId: string, userId: string, remainingParticipants: number): Promise<void> {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: { startedBy: { select: { id: true, displayName: true } } },
    });
    if (!call) throw new NotFoundException('Call not found');
    await this.channels.requireMembership(call.channelId, userId);
    if (call.endedAt || remainingParticipants > 0) return;

    const ended = await this.prisma.call.update({
      where: { id: callId },
      data: { endedAt: new Date(), isRecording: false },
    });
    this.realtime.toChannel(call.channelId, ServerEvents.CallEnded, {
      callId,
      channelId: call.channelId,
    });
    const minutes = Math.max(1, Math.round((ended.endedAt!.getTime() - call.startedAt.getTime()) / 60000));
    await this.messages.send(call.channelId, userId, {
      content: `Call ended · ${minutes} min`,
      clientMsgId: randomUUID(),
    });
  }

  // ---------- Recording ----------

  private async requireActiveCall(callId: string, userId: string) {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: { startedBy: { select: { id: true, displayName: true } } },
    });
    if (!call || call.endedAt) throw new NotFoundException('Call not found or already ended');
    await this.channels.requireMembership(call.channelId, userId);
    return call;
  }

  /** Everyone in the call sees a red REC indicator and hears the announcement. */
  async setRecording(callId: string, userId: string, recording: boolean): Promise<CallDto> {
    const call = await this.requireActiveCall(callId, userId);
    if (call.isRecording === recording) return this.toDto(call);

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const updated = await this.prisma.call.update({
      where: { id: callId },
      data: { isRecording: recording },
      include: { startedBy: { select: { id: true, displayName: true } } },
    });

    this.realtime.toChannel(call.channelId, ServerEvents.CallRecording, {
      callId,
      channelId: call.channelId,
      isRecording: recording,
      by: user.displayName,
    });
    await this.messages.send(call.channelId, userId, {
      content: recording
        ? `${user.displayName} started recording this call`
        : 'Recording stopped',
      clientMsgId: randomUUID(),
    });
    return this.toDto(updated);
  }

  /** Store the recorded audio in S3 and post it into the channel as a playable message. */
  async uploadRecording(callId: string, userId: string, file: Express.Multer.File) {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: { channel: { select: { workspaceId: true } } },
    });
    if (!call) throw new NotFoundException('Call not found');
    await this.channels.requireMembership(call.channelId, userId);
    if (!file?.buffer?.length) throw new BadRequestException('Empty recording');

    const mime = file.mimetype || 'audio/webm';
    const key = `recordings/${call.channel.workspaceId}/${callId}/${randomUUID()}.webm`;
    await this.s3.putObject(key, file.buffer, mime);

    const attachment = await this.prisma.attachment.create({
      data: {
        uploaderId: userId,
        workspaceId: call.channel.workspaceId,
        s3Key: key,
        filename: `call-recording-${new Date().toISOString().slice(0, 16).replace(':', '-')}.webm`,
        mimeType: mime,
        sizeBytes: BigInt(file.buffer.length),
        status: 'ready',
      },
    });

    const message = await this.messages.send(call.channelId, userId, {
      content: `[recording:${attachment.id}]`,
      clientMsgId: randomUUID(),
    });
    await this.prisma.attachment.update({
      where: { id: attachment.id },
      data: { messageId: message.id },
    });
    return { attachmentId: attachment.id, messageId: message.id };
  }
}
