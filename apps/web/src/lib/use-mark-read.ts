import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { clearLocalUnread } from './unreads';

/**
 * Debounced mark-read for a channel: optimistic sidebar clear immediately,
 * one REST call ~1s after the last trigger, flushed when leaving the channel.
 */
export function useMarkRead(channelId: string) {
  const queryClient = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMessageId = useRef<string | undefined>(undefined);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    } else {
      return; // nothing scheduled
    }
    const messageId = pendingMessageId.current;
    pendingMessageId.current = undefined;
    void api(`/channels/${channelId}/read`, {
      method: 'POST',
      body: JSON.stringify(messageId ? { messageId } : {}),
    }).catch(() => undefined);
  }, [channelId]);

  const markRead = useCallback(
    (messageId?: string) => {
      if (messageId) pendingMessageId.current = messageId;
      clearLocalUnread(queryClient, channelId);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 1000);
    },
    [channelId, flush, queryClient],
  );

  // Flush on unmount (channel switch) so the last view is persisted.
  useEffect(() => flush, [flush]);

  return markRead;
}
