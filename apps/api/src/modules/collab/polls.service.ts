import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { CreatePollRequest, PollDto } from '@inmobiles/shared-types';
import { ServerEvents } from '@inmobiles/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../gateway/realtime.service';
import { ChannelsService } from '../channels/channels.service';
import { MessagesService } from '../messages/messages.service';

@Injectable()
export class PollsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly channels: ChannelsService,
    private readonly messages: MessagesService,
  ) {}

  async create(channelId: string, userId: string, dto: CreatePollRequest) {
    await this.channels.requirePostable(channelId, userId, false);
    const pollId = randomUUID();
    // The poll rides on a normal message whose content is a [poll:<id>] marker.
    const message = await this.messages.send(channelId, userId, {
      content: `[poll:${pollId}]`,
      clientMsgId: randomUUID(),
    });
    await this.prisma.poll.create({
      data: {
        id: pollId,
        messageId: message.id,
        channelId,
        question: dto.question,
        multiple: dto.multiple,
        createdById: userId,
        options: { create: dto.options.map((text) => ({ text })) },
      },
    });
    return { message, poll: await this.getPoll(pollId, userId) };
  }

  async getPoll(pollId: string, userId: string): Promise<PollDto> {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: { include: { votes: true } } },
    });
    if (!poll) throw new NotFoundException('Poll not found');
    await this.channels.requireMembership(poll.channelId, userId);
    const myVotes: string[] = [];
    let total = 0;
    const options = poll.options.map((o) => {
      const voters = o.votes.map((v) => v.userId);
      total += voters.length;
      if (voters.includes(userId)) myVotes.push(o.id);
      return { id: o.id, text: o.text, votes: voters.length, voters };
    });
    return {
      id: poll.id,
      channelId: poll.channelId,
      question: poll.question,
      multiple: poll.multiple,
      options,
      totalVotes: total,
      myVotes,
    };
  }

  async vote(pollId: string, userId: string, optionId: string): Promise<PollDto> {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: { select: { id: true } } },
    });
    if (!poll) throw new NotFoundException('Poll not found');
    await this.channels.requireMembership(poll.channelId, userId);
    const optionIds = poll.options.map((o) => o.id);
    if (!optionIds.includes(optionId)) throw new NotFoundException('Option not found');

    const existing = await this.prisma.pollVote.findUnique({
      where: { optionId_userId: { optionId, userId } },
    });
    if (existing) {
      await this.prisma.pollVote.delete({ where: { optionId_userId: { optionId, userId } } });
    } else {
      if (!poll.multiple) {
        // Single-choice: clear any prior vote in this poll first.
        await this.prisma.pollVote.deleteMany({ where: { pollId, userId } });
      }
      await this.prisma.pollVote.create({ data: { optionId, pollId, userId } });
    }
    this.realtime.toChannel(poll.channelId, ServerEvents.PollUpdate, {
      pollId,
      channelId: poll.channelId,
    });
    return this.getPoll(pollId, userId);
  }
}
