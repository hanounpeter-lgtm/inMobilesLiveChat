import { Injectable } from '@nestjs/common';
import type { SearchResultDto } from '@inmobiles/shared-types';
import { PrismaService } from '../../prisma/prisma.service';

interface SearchRow {
  id: string;
  channelId: string;
  channelName: string | null;
  channelType: 'public' | 'private' | 'dm' | 'group_dm';
  authorDisplayName: string;
  snippet: string;
  createdAt: Date;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Full-text search over messages. Membership scoping happens IN SQL via
   * the channel_members join — non-member content can never appear. Only
   * $queryRaw tagged templates (parameterized); websearch_to_tsquery accepts
   * arbitrary user input without throwing.
   */
  async search(userId: string, q: string, channelId?: string): Promise<SearchResultDto[]> {
    const query = q.trim();
    if (query.length < 2) return [];

    const rows = await this.prisma.$queryRaw<SearchRow[]>`
      SELECT m.id,
             m.channel_id                       AS "channelId",
             c.name                             AS "channelName",
             c.type::text                       AS "channelType",
             u.display_name                     AS "authorDisplayName",
             m.created_at                       AS "createdAt",
             ts_headline(
               'simple', m.content, websearch_to_tsquery('simple', ${query}),
               'StartSel=' || chr(1) || ',StopSel=' || chr(2) || ',MaxWords=24,MinWords=10'
             )                                  AS snippet
      FROM messages m
      JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = ${userId}::uuid
      JOIN channels c ON c.id = m.channel_id
      JOIN users u ON u.id = m.user_id
      WHERE m.deleted_at IS NULL
        AND m.content_tsv @@ websearch_to_tsquery('simple', ${query})
        AND m.content !~ '^\\[(sticker|voice|recording):'
        AND (${channelId ?? null}::uuid IS NULL OR m.channel_id = ${channelId ?? null}::uuid)
      ORDER BY m.created_at DESC
      LIMIT 30`;

    return rows.map((r) => ({
      messageId: r.id,
      channelId: r.channelId,
      channelName: r.channelName,
      channelType: r.channelType,
      authorDisplayName: r.authorDisplayName,
      snippet: r.snippet,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
