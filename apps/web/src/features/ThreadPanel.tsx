import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChannelSummary, MessageDto, ThreadResponse } from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { useChatStore } from '../lib/chat-store';
import { threadKey, upsertThreadReply } from '../lib/message-cache';
import { shouldGroup } from '../lib/message-utils';
import Composer from './Composer';
import MessageItem from './MessageItem';
import MessageContextMenu, { type MenuState } from './MessageContextMenu';
import { IconX } from '../components/icons';

export default function ThreadPanel({
  parentId,
  channel,
}: {
  parentId: string;
  channel: ChannelSummary;
}) {
  const queryClient = useQueryClient();
  const closeThread = useChatStore((s) => s.closeThread);
  const [contextMenu, setContextMenu] = useState<MenuState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const thread = useQuery({
    queryKey: threadKey(parentId),
    queryFn: () => api<ThreadResponse>(`/messages/${parentId}/thread`),
  });

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeThread();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [closeThread]);

  const replies = thread.data?.messages ?? [];

  // Stick to bottom as replies arrive.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [replies.length]);

  const onOptimisticSend = (message: MessageDto) => {
    upsertThreadReply(queryClient, parentId, message);
  };

  const title =
    channel.type === 'dm' || channel.type === 'group_dm'
      ? 'Thread'
      : `Thread · #${channel.name}`;

  return (
    <aside className="details-panel thread-panel">
      <div className="details-header">
        <h3>{title}</h3>
        <button className="icon-btn" title="Close" onClick={closeThread}>
          <IconX size={15} />
        </button>
      </div>

      <div className="thread-body" ref={scrollRef}>
        {thread.isLoading && <div className="muted pad-sm">Loading thread…</div>}
        {thread.data && (
          <>
            <MessageItem
              message={thread.data.parent}
              grouped={false}
              showReplyPill={false}
              onContextMenu={(e, message) =>
                setContextMenu({ x: e.clientX, y: e.clientY, message })
              }
              isEditing={editingId === thread.data.parent.id}
              onEditDone={() => setEditingId(null)}
            />
            <div className="thread-divider">
              <span>
                {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
              </span>
            </div>
            {replies.map((m, i) => (
              <MessageItem
                key={m.clientMsgId}
                message={m}
                grouped={shouldGroup(replies[i - 1], m)}
                showReplyPill={false}
                onContextMenu={(e, message) =>
                  setContextMenu({ x: e.clientX, y: e.clientY, message })
                }
                isEditing={editingId === m.id}
                onEditDone={() => setEditingId(null)}
              />
            ))}
          </>
        )}
      </div>

      {contextMenu && (
        <MessageContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onStartEdit={(message) => setEditingId(message.id)}
        />
      )}

      {channel.isArchived ? (
        <div className="composer-locked muted">This channel is archived.</div>
      ) : (
        <Composer
          channel={channel}
          parentMessageId={parentId}
          onOptimisticSend={onOptimisticSend}
        />
      )}
    </aside>
  );
}
