import { useMemo } from 'react';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { MyUnreadsResponse, UnreadState } from '@inmobiles/shared-types';
import { api } from './api';

export const unreadsKey = ['unreads'] as const;

export function useUnreads(): { unreads: Record<string, UnreadState>; isLoaded: boolean } {
  const query = useQuery({
    queryKey: unreadsKey,
    queryFn: () => api<MyUnreadsResponse>('/me/unreads'),
  });
  const unreads = useMemo(
    () => Object.fromEntries((query.data?.unreads ?? []).map((u) => [u.channelId, u])),
    [query.data],
  );
  return { unreads, isLoaded: query.isSuccess };
}

/** Server-authoritative per-channel update (unread:update socket event). */
export function applyUnreadUpdate(queryClient: QueryClient, state: UnreadState) {
  queryClient.setQueryData<MyUnreadsResponse>(unreadsKey, (data) => {
    const list = data?.unreads ?? [];
    const idx = list.findIndex((u) => u.channelId === state.channelId);
    return {
      unreads: idx === -1 ? [...list, state] : list.map((u, i) => (i === idx ? state : u)),
    };
  });
}

/** Local bold-now on message:new — the server only pushes unread:update for
 * mentions/DMs, plain messages bold locally and the next refetch confirms. */
export function bumpLocalUnread(queryClient: QueryClient, channelId: string) {
  queryClient.setQueryData<MyUnreadsResponse>(unreadsKey, (data) => {
    if (!data) return data;
    const found = data.unreads.some((u) => u.channelId === channelId);
    return {
      unreads: found
        ? data.unreads.map((u) => (u.channelId === channelId ? { ...u, hasUnread: true } : u))
        : [
            ...data.unreads,
            {
              channelId,
              lastReadAt: null,
              lastReadMessageId: null,
              hasUnread: true,
              mentionCount: 0,
            },
          ],
    };
  });
}

/** Optimistic clear when marking read; the socket echo confirms/corrects. */
export function clearLocalUnread(queryClient: QueryClient, channelId: string) {
  queryClient.setQueryData<MyUnreadsResponse>(unreadsKey, (data) =>
    data
      ? {
          unreads: data.unreads.map((u) =>
            u.channelId === channelId ? { ...u, hasUnread: false, mentionCount: 0 } : u,
          ),
        }
      : data,
  );
}
