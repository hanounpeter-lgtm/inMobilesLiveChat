import type { MessageDto } from '@inmobiles/shared-types';

/** Group consecutive messages from the same author within 5 minutes. */
export function shouldGroup(prev: MessageDto | undefined, curr: MessageDto): boolean {
  if (!prev) return false;
  return (
    prev.author.id === curr.author.id &&
    !prev.isDeleted &&
    new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000
  );
}
