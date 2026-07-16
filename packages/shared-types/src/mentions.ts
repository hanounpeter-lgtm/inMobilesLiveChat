// Mention token conventions, shared by API (fan-out) and web (render/compose).
// A user mention is stored in message content as `<@userId>` — it survives
// display-name changes. `<!channel>` notifies every channel member.

export const MENTION_RE =
  /<@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>/gi;

export const MENTION_CHANNEL_TOKEN = '<!channel>';

export function parseMentionIds(content: string): string[] {
  const ids = new Set<string>();
  for (const match of content.matchAll(MENTION_RE)) {
    ids.add(match[1].toLowerCase());
  }
  return [...ids];
}

export function hasChannelMention(content: string): boolean {
  return content.includes(MENTION_CHANNEL_TOKEN);
}
