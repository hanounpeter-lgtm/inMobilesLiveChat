import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChannelSummary,
  JoinCallResponse,
  MessageDto,
  MessagePage,
} from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { useChatStore } from '../lib/chat-store';
import { messagesKey, upsertMessage } from '../lib/message-cache';
import { useAuth } from '../lib/auth-store';
import { canManageChannel } from '../lib/permissions';
import Composer from './Composer';
import MessageItem from './MessageItem';
import CallBanner from './CallBanner';
import MessageContextMenu, { type MenuState } from './MessageContextMenu';
import { useMarkRead } from '../lib/use-mark-read';
import { useUnreads } from '../lib/unreads';

// Stable fallback: returning a fresh [] from the zustand selector would make
// every render look like a state change and loop forever.
const NO_TYPING: { id: string; displayName: string }[] = [];

function channelTitle(channel: ChannelSummary): string {
  if (channel.type === 'dm' || channel.type === 'group_dm') {
    return channel.memberPreviews?.map((m) => m.displayName).join(', ') || 'Direct message';
  }
  return `${channel.type === 'private' ? '🔒' : '#'} ${channel.name}`;
}

/** Group consecutive messages from the same author within 5 minutes. */
function shouldGroup(prev: MessageDto | undefined, curr: MessageDto): boolean {
  if (!prev) return false;
  return (
    prev.author.id === curr.author.id &&
    !prev.isDeleted &&
    new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000
  );
}

const dayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return dayFmt.format(date);
}

const isNewDay = (prev: MessageDto | undefined, curr: MessageDto) =>
  !prev || new Date(prev.createdAt).toDateString() !== new Date(curr.createdAt).toDateString();

export default function MessagePane({ channel }: { channel: ChannelSummary }) {
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const typing = useChatStore((s) => s.typingByChannel[channel.id] ?? NO_TYPING);
  const markRead = useMarkRead(channel.id);
  const { unreads, isLoaded: unreadsLoaded } = useUnreads();
  // Freeze the unread boundary at first render so the divider doesn't jump
  // while you're reading; it resets on channel switch (component remount).
  const divider = useRef<{ set: boolean; at: string | null }>({ set: false, at: null });
  if (!divider.current.set && unreadsLoaded) {
    divider.current = { set: true, at: unreads[channel.id]?.lastReadAt ?? null };
  }
  const setCurrentCall = useChatStore((s) => s.setCurrentCall);
  const inCall = useChatStore((s) => s.currentCall !== null);
  const detailsPanelOpen = useChatStore((s) => s.detailsPanelOpen);
  const setDetailsPanel = useChatStore((s) => s.setDetailsPanel);
  const canManage = canManageChannel(channel, user);
  const canPost =
    !channel.isArchived && (channel.postingPolicy !== 'admins_only' || canManage);

  const toggleStar = async () => {
    const updated = await api<ChannelSummary>(`/channels/${channel.id}/my-settings`, {
      method: 'PATCH',
      body: JSON.stringify({ isStarred: !channel.isStarred }),
    });
    queryClient.setQueryData<{ channels: ChannelSummary[] }>(['channels'], (data) =>
      data ? { channels: data.channels.map((c) => (c.id === updated.id ? updated : c)) } : data,
    );
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [contextMenu, setContextMenu] = useState<MenuState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const setComposerFiles = useChatStore((s) => s.setComposerFiles);

  const query = useInfiniteQuery({
    queryKey: messagesKey(channel.id),
    queryFn: ({ pageParam }) =>
      api<MessagePage>(
        `/channels/${channel.id}/messages${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  // Pages are newest-first; each page's messages are ascending.
  const messages = useMemo(() => {
    const pages = query.data?.pages ?? [];
    return [...pages].reverse().flatMap((p) => p.messages);
  }, [query.data]);

  // Track whether the user is reading history; only auto-scroll when at bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      if (el.scrollTop < 200 && query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [query]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
    const latest = messages[messages.length - 1];
    if (latest && stickToBottom.current && document.hasFocus()) {
      markRead(latest.id);
    }
  }, [messages, channel.id, markRead]);

  // Focusing the window while at the bottom counts as reading.
  useEffect(() => {
    const onFocus = () => {
      const latest = messages[messages.length - 1];
      if (latest && stickToBottom.current) markRead(latest.id);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [messages, markRead]);

  // First unread boundary for the "New messages" divider.
  const firstUnreadId = useMemo(() => {
    if (!divider.current.set) return null;
    const at = divider.current.at ? new Date(divider.current.at).getTime() : 0;
    const first = messages.find(
      (m) => new Date(m.createdAt).getTime() > at && m.author.id !== user?.id,
    );
    return first?.id ?? null;
  }, [messages, user?.id]);

  const typingOthers = typing.filter((t) => t.id !== user?.id);

  const onOptimisticSend = (message: MessageDto) => {
    stickToBottom.current = true;
    upsertMessage(queryClient, message);
  };

  const startCall = async (type: 'audio' | 'video') => {
    const join = await api<JoinCallResponse>(`/channels/${channel.id}/call`, {
      method: 'POST',
      body: JSON.stringify({ type }),
    });
    setCurrentCall(join);
  };

  return (
    <main
      className="message-pane"
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          dragDepth.current += 1;
          setDragging(true);
        }
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        const files = [...e.dataTransfer.files];
        if (files.length > 0 && canPost) setComposerFiles(files);
      }}
    >
      {dragging && canPost && (
        <div className="drop-overlay">
          <span>Drop files to upload to {channelTitle(channel)}</span>
        </div>
      )}
      <header className="channel-header">
        <h2>{channelTitle(channel)}</h2>
        {channel.topic && <span className="muted topic">{channel.topic}</span>}
        {channel.isArchived && <span className="archived-pill">Archived</span>}
        <div className="header-actions">
          <button
            className={`call-btn star-header ${channel.isStarred ? 'starred' : ''}`}
            title={channel.isStarred ? 'Unstar channel' : 'Star channel'}
            onClick={() => void toggleStar()}
          >
            {channel.isStarred ? '★' : '☆'}
          </button>
          <button
            className="call-btn"
            title="Start audio call"
            disabled={inCall || channel.isArchived}
            onClick={() => void startCall('audio')}
          >
            📞
          </button>
          <button
            className="call-btn"
            title="Start video call"
            disabled={inCall || channel.isArchived}
            onClick={() => void startCall('video')}
          >
            🎥
          </button>
          <button
            className="call-btn"
            title="Channel details"
            onClick={() => setDetailsPanel(!detailsPanelOpen)}
          >
            ⓘ
          </button>
        </div>
      </header>
      <CallBanner channel={channel} />

      <div className="message-scroll" ref={scrollRef}>
        {query.hasNextPage && (
          <div className="load-more muted">
            {query.isFetchingNextPage ? 'Loading…' : 'Scroll up for history'}
          </div>
        )}
        {query.isLoading && <div className="fullscreen-center muted">Loading messages…</div>}
        {messages.map((m, i) => {
          const newDay = isNewDay(messages[i - 1], m);
          return (
            <div key={m.clientMsgId}>
              {newDay && (
                <div className="day-divider">
                  <span>{dayLabel(m.createdAt)}</span>
                </div>
              )}
              {m.id === firstUnreadId && (
                <div className="new-divider">
                  <span>New messages</span>
                </div>
              )}
              <MessageItem
                message={m}
                grouped={!newDay && shouldGroup(messages[i - 1], m)}
                onContextMenu={(e, message) =>
                  setContextMenu({ x: e.clientX, y: e.clientY, message })
                }
                isEditing={editingId === m.id}
                onEditDone={() => setEditingId(null)}
              />
            </div>
          );
        })}
      </div>

      <div className="typing-row">
        {typingOthers.length > 0 && (
          <span>
            {typingOthers.map((t) => t.displayName).join(', ')}{' '}
            {typingOthers.length === 1 ? 'is' : 'are'} typing…
          </span>
        )}
      </div>

      {contextMenu && (
        <MessageContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onStartEdit={(message) => setEditingId(message.id)}
        />
      )}
      {canPost ? (
        <Composer channel={channel} onOptimisticSend={onOptimisticSend} />
      ) : (
        <div className="composer-locked muted">
          {channel.isArchived
            ? 'This channel has been archived — it is read-only.'
            : 'Only admins can post in this channel.'}
        </div>
      )}
    </main>
  );
}
