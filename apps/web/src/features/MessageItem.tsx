import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { FileUrlResponse, MessageDto } from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { upsertMessage } from '../lib/message-cache';
import { formatMentions, MENTION_HREF_PREFIX } from '../lib/mention-format';
import { useChatStore } from '../lib/chat-store';
import { IconHeadphones, IconMessageCircle, IconMic, IconPin, IconX } from '../components/icons';
import { useUsersById } from '../lib/users';
import { parseSticker, stickerUrl } from './stickers';
import AttachmentList from './Attachments';

const AUDIO_MESSAGE_RE = /^\[(recording|voice):([0-9a-f-]{36})\]$/;

/** Audio message (call recording or voice note): resolves a short-lived
 * playback URL and renders a labeled player. */
function AudioMessage({ kind, attachmentId }: { kind: string; attachmentId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const label = kind === 'voice' ? 'Voice note' : 'Call recording';
  const icon = kind === 'voice' ? <IconMic size={13} /> : <IconHeadphones size={13} />;

  useEffect(() => {
    api<FileUrlResponse>(`/files/${attachmentId}/url`)
      .then((res) => setUrl(res.url))
      .catch(() => setFailed(true));
  }, [attachmentId]);

  if (failed) return <div className="muted">{label} unavailable</div>;
  return (
    <div className="recording-message">
      <span className="recording-label">
        {icon} {label}
      </span>
      {url ? <audio controls preload="metadata" src={url} /> : <span className="muted">Loading…</span>}
    </div>
  );
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

/** Reaction chips under a message; clicking toggles the caller's reaction. */
function ReactionRow({ message, selfId }: { message: MessageDto; selfId?: string }) {
  if (message.reactions.length === 0) return null;
  const toggle = (emoji: string) => {
    void api(`/messages/${message.id}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    }).catch(() => undefined);
  };
  return (
    <div className="reaction-row">
      {message.reactions.map((r) => (
        <button
          key={r.emoji}
          className={`reaction-chip ${selfId && r.userIds.includes(selfId) ? 'mine' : ''}`}
          title={`${r.userIds.length} reaction${r.userIds.length === 1 ? '' : 's'}`}
          onClick={() => toggle(r.emoji)}
        >
          {r.emoji} {r.userIds.length}
        </button>
      ))}
    </div>
  );
}

// Forest Ledger palette — earthy, deterministic per user.
const AVATAR_COLORS = [
  '#2E6B4F', // pine
  '#B7791F', // gold ochre
  '#A14E2C', // rust
  '#7C3A3F', // burgundy
  '#46647D', // slate blue
  '#6D4A74', // plum
  '#2F6F6A', // teal
  '#6F5233', // walnut
  '#B0663A', // terracotta
  '#5C6B3C', // olive
];

function avatarColor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/** Inline editor shown in place of the message content. */
function InlineEdit({ message, onDone }: { message: MessageDto; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(message.content);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, []);

  const save = async () => {
    const content = value.trim();
    if (!content || content === message.content) {
      onDone();
      return;
    }
    setBusy(true);
    try {
      const updated = await api<MessageDto>(`/messages/${message.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      });
      upsertMessage(queryClient, updated);
    } catch {
      /* leave original; socket echo will correct if needed */
    }
    onDone();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void save();
    }
    if (e.key === 'Escape') onDone();
  };

  return (
    <div className="edit-box">
      <textarea
        ref={ref}
        value={value}
        rows={Math.min(8, value.split('\n').length)}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="edit-actions">
        <span className="muted">Enter to save · Esc to cancel</span>
        <button className="btn-secondary" onClick={onDone} disabled={busy}>
          Cancel
        </button>
        <button className="btn-primary" onClick={() => void save()} disabled={busy || !value.trim()}>
          Save
        </button>
      </div>
    </div>
  );
}

const replyTimeFmt = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

export default function MessageItem({
  message,
  grouped,
  onContextMenu,
  isEditing = false,
  onEditDone,
  showReplyPill = true,
}: {
  message: MessageDto;
  grouped: boolean;
  onContextMenu?: (e: React.MouseEvent, message: MessageDto) => void;
  isEditing?: boolean;
  onEditDone?: () => void;
  showReplyPill?: boolean;
}) {
  const user = useAuth((s) => s.user);
  const usersById = useUsersById();
  const openThread = useChatStore((s) => s.openThread);
  const own = user?.id === message.author.id;
  const pending = message.id === message.clientMsgId; // optimistic placeholder

  const onDelete = () => {
    if (window.confirm('Delete this message?')) {
      void api(`/messages/${message.id}`, { method: 'DELETE' }).catch(() => undefined);
    }
  };

  return (
    <div
      className={`message ${grouped ? 'grouped' : ''} ${pending ? 'pending' : ''}`}
      onContextMenu={
        onContextMenu && !pending
          ? (e) => {
              e.preventDefault();
              onContextMenu(e, message);
            }
          : undefined
      }
    >
      {!grouped ? (
        <div className="avatar" style={{ background: avatarColor(message.author.id) }}>
          {message.author.displayName.slice(0, 1).toUpperCase()}
        </div>
      ) : (
        <div className="avatar-spacer" />
      )}
      <div className="message-body">
        {!grouped && (
          <div className="message-meta">
            <span className="author">{message.author.displayName}</span>
            <span className="timestamp">{timeFmt.format(new Date(message.createdAt))}</span>
            {message.isPinned && (
              <span className="pin-indicator" title="Pinned message">
                <IconPin size={12} />
              </span>
            )}
          </div>
        )}
        {grouped && message.isPinned && (
          <span className="pin-indicator grouped-pin" title="Pinned message">
            <IconPin size={12} />
          </span>
        )}
        {message.isDeleted ? (
          <div className="deleted muted">This message was deleted</div>
        ) : isEditing && onEditDone ? (
          <InlineEdit message={message} onDone={onEditDone} />
        ) : (
          (() => {
            const audioMatch = AUDIO_MESSAGE_RE.exec(message.content.trim());
            if (audioMatch) {
              return <AudioMessage kind={audioMatch[1]} attachmentId={audioMatch[2]} />;
            }
            const sticker = parseSticker(message.content);
            if (sticker) {
              return (
                <img
                  className="sticker-message"
                  src={stickerUrl(sticker.code)}
                  alt={sticker.label}
                  title={sticker.label}
                />
              );
            }
            return (
              <div className="message-content">
                {/* react-markdown never injects raw HTML — safe against XSS.
                    Mention tokens are pre-processed into mention:// links and
                    rendered as chips by the custom anchor component. */}
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  // Keep the default sanitizer but let our mention:// scheme
                  // through — it renders as a chip, never as a real link.
                  urlTransform={(url) =>
                    url.startsWith(MENTION_HREF_PREFIX) ? url : defaultUrlTransform(url)
                  }
                  components={{
                    a: ({ href, children }) => {
                      if (href?.startsWith(MENTION_HREF_PREFIX)) {
                        const id = href.slice(MENTION_HREF_PREFIX.length);
                        const isSelf = id === 'channel' || id === user?.id;
                        return (
                          <span className={`mention ${isSelf ? 'mention-self' : ''}`}>
                            {children}
                          </span>
                        );
                      }
                      return (
                        <a href={href} target="_blank" rel="noreferrer">
                          {children}
                        </a>
                      );
                    },
                  }}
                >
                  {formatMentions(message.content, usersById)}
                </ReactMarkdown>
                {message.isEdited && <span className="edited muted">(edited)</span>}
              </div>
            );
          })()
        )}
        {!message.isDeleted && <AttachmentList attachments={message.attachments} />}
        {!message.isDeleted && <ReactionRow message={message} selfId={user?.id} />}
        {showReplyPill && message.replyCount > 0 && !message.parentMessageId && (
          <button className="reply-pill" onClick={() => openThread(message.id)}>
            <IconMessageCircle size={13} /> {message.replyCount}{' '}
            {message.replyCount === 1 ? 'reply' : 'replies'}
            {message.lastReplyAt && (
              <span className="muted"> · {replyTimeFmt.format(new Date(message.lastReplyAt))}</span>
            )}
          </button>
        )}
      </div>
      {own && !message.isDeleted && !pending && (
        <button className="message-action" title="Delete" onClick={onDelete}>
          <IconX size={12} />
        </button>
      )}
    </div>
  );
}
