import { MENTION_RE, MENTION_CHANNEL_TOKEN } from '@inmobiles/shared-types';

export const MENTION_HREF_PREFIX = 'mention://';

const cleanLabel = (name: string) => name.replace(/[[\]()]/g, '');

/**
 * Convert stored mention tokens into markdown links our renderer turns into
 * chips: `<@id>` → `[@Name](mention://id)`, `<!channel>` → `[@channel](...)`.
 */
export function formatMentions(
  content: string,
  displayNameById: Record<string, string>,
): string {
  return content
    .replace(MENTION_RE, (_m, id: string) => {
      const name = displayNameById[id.toLowerCase()] ?? 'unknown';
      return `[@${cleanLabel(name)}](${MENTION_HREF_PREFIX}${id.toLowerCase()})`;
    })
    .replaceAll(MENTION_CHANNEL_TOKEN, `[@channel](${MENTION_HREF_PREFIX}channel)`);
}

/** Plain-text variant for snippets (Activity feed, pins). */
export function stripMentionTokens(
  content: string,
  displayNameById: Record<string, string>,
): string {
  return content
    .replace(MENTION_RE, (_m, id: string) => `@${displayNameById[id.toLowerCase()] ?? 'unknown'}`)
    .replaceAll(MENTION_CHANNEL_TOKEN, '@channel');
}
