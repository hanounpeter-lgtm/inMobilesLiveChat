import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ChannelsService } from '../channels/channels.service';
import { MessagesService } from '../messages/messages.service';

@Injectable()
export class BroadcastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
    private readonly messages: MessagesService,
  ) {}

  /** Send the same message (📣-prefixed) to many channels/DMs at once. Skips
   * any target the user can't post to. */
  async broadcast(userId: string, channelIds: string[], text: string): Promise<{ sent: number }> {
    let sent = 0;
    for (const channelId of channelIds) {
      try {
        await this.channels.requirePostable(channelId, userId, false);
        await this.messages.send(channelId, userId, {
          content: `📣 ${text}`,
          clientMsgId: randomUUID(),
        });
        sent++;
      } catch {
        /* not a member / can't post — skip */
      }
    }
    return { sent };
  }
}
