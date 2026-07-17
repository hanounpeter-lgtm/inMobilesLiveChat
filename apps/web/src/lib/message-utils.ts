import type { MessageDto } from '@inmobiles/shared-types';

// Server-generated call/recording notices.
export const SYSTEM_LINE_RE =
  /^(Started a (video )?call|Call ended · \d+ min|Recording stopped|.{1,80} started recording this call)$/;

export const isSystemEvent = (m: MessageDto) =>
  !m.isDeleted && SYSTEM_LINE_RE.test(m.content.trim());

/** Human line for an event chip: prefix the author when the text is impersonal. */
export function systemEventText(m: MessageDto): string {
  const content = m.content.trim();
  if (/^(Started a|Call ended)/.test(content)) {
    return content.startsWith('Started a')
      ? `${m.author.displayName} ${content[0].toLowerCase()}${content.slice(1)}`
      : content;
  }
  return content;
}

/**
 * Markdown collapses runs of blank lines; chat should render them literally.
 * Turn each blank line into a non-breaking-space line (remark-breaks then
 * emits one <br> per line) — but never inside fenced code blocks, where
 * blank lines are real content.
 */
export function preserveBlankLines(content: string): string {
  let inFence = false;
  return content
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (!inFence && line.trim() === '') return String.fromCharCode(160); // NBSP - whitespace-only lines are still blank to markdown
      return line;
    })
    .join('\n');
}

/** Group consecutive messages from the same author within 5 minutes. */
export function shouldGroup(prev: MessageDto | undefined, curr: MessageDto): boolean {
  if (!prev) return false;
  return (
    prev.author.id === curr.author.id &&
    !prev.isDeleted &&
    !isSystemEvent(prev) &&
    new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000
  );
}
