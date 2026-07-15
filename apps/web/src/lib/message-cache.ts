import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { MessageDto, MessagePage } from '@inmobiles/shared-types';

export const messagesKey = (channelId: string) => ['messages', channelId] as const;

type MessagesData = InfiniteData<MessagePage>;

/**
 * Upsert a message into the newest page of a channel's infinite cache.
 * Dedupe key is clientMsgId, which also reconciles optimistic sends with the
 * authoritative copy that arrives via POST response or socket echo.
 */
export function upsertMessage(queryClient: QueryClient, message: MessageDto) {
  queryClient.setQueryData<MessagesData>(messagesKey(message.channelId), (data) => {
    if (!data) return data;
    let replaced = false;
    const pages = data.pages.map((page) => {
      const idx = page.messages.findIndex(
        (m) => m.clientMsgId === message.clientMsgId || m.id === message.id,
      );
      if (idx === -1) return page;
      replaced = true;
      const messages = [...page.messages];
      messages[idx] = message;
      return { ...page, messages };
    });
    if (replaced) return { ...data, pages };
    // Pages are ordered newest-first; page 0 holds the latest messages.
    const first = data.pages[0];
    return {
      ...data,
      pages: [{ ...first, messages: [...first.messages, message] }, ...data.pages.slice(1)],
    };
  });
}

export function removeMessage(queryClient: QueryClient, channelId: string, messageId: string) {
  queryClient.setQueryData<MessagesData>(messagesKey(channelId), (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        messages: page.messages.map((m) =>
          m.id === messageId ? { ...m, isDeleted: true, content: '' } : m,
        ),
      })),
    };
  });
}
