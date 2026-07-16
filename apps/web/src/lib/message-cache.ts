import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { MessageDto, MessagePage, ThreadResponse } from '@inmobiles/shared-types';

export const messagesKey = (channelId: string) => ['messages', channelId] as const;
export const threadKey = (parentId: string) => ['thread', parentId] as const;

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
    // Never append thread replies to the top-level list — the server excludes
    // them from channel pages, so an unknown reply id must not be injected.
    if (message.parentMessageId) return data;
    // Pages are ordered newest-first; page 0 holds the latest messages.
    const first = data.pages[0];
    return {
      ...data,
      pages: [{ ...first, messages: [...first.messages, message] }, ...data.pages.slice(1)],
    };
  });
}

/** Insert/replace a reply in an open thread cache (dedupe by clientMsgId). */
export function upsertThreadReply(
  queryClient: QueryClient,
  parentId: string,
  message: MessageDto,
) {
  queryClient.setQueryData<ThreadResponse>(threadKey(parentId), (data) => {
    if (!data) return data;
    const idx = data.messages.findIndex(
      (m) => m.clientMsgId === message.clientMsgId || m.id === message.id,
    );
    if (idx !== -1) {
      const messages = [...data.messages];
      messages[idx] = message;
      return { ...data, messages };
    }
    return { ...data, messages: [...data.messages, message] };
  });
}

/** Bump a parent's replyCount in the channel list (socket handler only —
 * the server broadcasts each reply exactly once, so this stays exact). */
export function bumpReplyCount(
  queryClient: QueryClient,
  channelId: string,
  parentMessageId: string,
  lastReplyAt: string,
) {
  queryClient.setQueryData<MessagesData>(messagesKey(channelId), (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        messages: page.messages.map((m) =>
          m.id === parentMessageId
            ? { ...m, replyCount: m.replyCount + 1, lastReplyAt }
            : m,
        ),
      })),
    };
  });
}

/** Route message:updated into thread caches (reply rows + parent header). */
export function patchThreadMessage(queryClient: QueryClient, message: MessageDto) {
  if (message.parentMessageId) {
    queryClient.setQueryData<ThreadResponse>(threadKey(message.parentMessageId), (data) =>
      data
        ? { ...data, messages: data.messages.map((m) => (m.id === message.id ? message : m)) }
        : data,
    );
  } else {
    queryClient.setQueryData<ThreadResponse>(threadKey(message.id), (data) =>
      data ? { ...data, parent: message } : data,
    );
  }
}

/** message:deleted carries no parent id — sweep all thread caches. */
export function markThreadMessageDeleted(queryClient: QueryClient, messageId: string) {
  queryClient.setQueriesData<ThreadResponse>({ queryKey: ['thread'] }, (data) => {
    if (!data) return data;
    const tombstone = (m: MessageDto) =>
      m.id === messageId ? { ...m, isDeleted: true, content: '', attachments: [] } : m;
    return { parent: tombstone(data.parent), messages: data.messages.map(tombstone) };
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
