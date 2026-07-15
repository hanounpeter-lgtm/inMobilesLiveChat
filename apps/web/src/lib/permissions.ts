import type { AuthUser, ChannelSummary } from '@inmobiles/shared-types';

/** Mirrors the server rule: channel creator or workspace owner/admin. */
export function canManageChannel(channel: ChannelSummary, user: AuthUser | null): boolean {
  if (!user) return false;
  return user.role === 'owner' || user.role === 'admin' || channel.createdById === user.id;
}
