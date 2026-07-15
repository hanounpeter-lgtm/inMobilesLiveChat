import { useEffect, useMemo, useRef } from 'react';
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

export default function MessagePane({ channel }: { channel: ChannelSummary }) {
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const typing = useChatStore((s) => s.typingByChannel[channel.id] ?? NO_TYPING);
  const markSeen = useChatStore((s) => s.markSeen);
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
    markSeen(channel.id);
  }, [messages.length, channel.id, markSeen]);

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
    <main className="message-pane">
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
        {messages.map((m, i) => (
          <MessageItem key={m.clientMsgId} message={m} grouped={shouldGroup(messages[i - 1], m)} />
        ))}
      </div>

      <div className="typing-row">
        {typingOthers.length > 0 && (
          <span>
            {typingOthers.map((t) => t.displayName).join(', ')}{' '}
            {typingOthers.length === 1 ? 'is' : 'are'} typing…
          </span>
        )}
      </div>

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
