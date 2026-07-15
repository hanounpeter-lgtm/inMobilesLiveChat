import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { FileUrlResponse, MessageDto } from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { parseSticker, stickerUrl } from './stickers';

const RECORDING_RE = /^\[recording:([0-9a-f-]{36})\]$/;

/** Call recording message: resolves a short-lived playback URL, renders audio. */
function RecordingMessage({ attachmentId }: { attachmentId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api<FileUrlResponse>(`/files/${attachmentId}/url`)
      .then((res) => setUrl(res.url))
      .catch(() => setFailed(true));
  }, [attachmentId]);

  if (failed) return <div className="muted">🎙 Call recording unavailable</div>;
  return (
    <div className="recording-message">
      <span className="recording-label">🎙 Call recording</span>
      {url ? <audio controls preload="metadata" src={url} /> : <span className="muted">Loading…</span>}
    </div>
  );
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

function avatarColor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 55% 45%)`;
}

export default function MessageItem({
  message,
  grouped,
}: {
  message: MessageDto;
  grouped: boolean;
}) {
  const user = useAuth((s) => s.user);
  const own = user?.id === message.author.id;
  const pending = message.id === message.clientMsgId; // optimistic placeholder

  const onDelete = () => {
    if (window.confirm('Delete this message?')) {
      void api(`/messages/${message.id}`, { method: 'DELETE' }).catch(() => undefined);
    }
  };

  return (
    <div className={`message ${grouped ? 'grouped' : ''} ${pending ? 'pending' : ''}`}>
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
          </div>
        )}
        {message.isDeleted ? (
          <div className="deleted muted">This message was deleted</div>
        ) : (
          (() => {
            const recMatch = RECORDING_RE.exec(message.content.trim());
            if (recMatch) {
              return <RecordingMessage attachmentId={recMatch[1]} />;
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
                {/* react-markdown never injects raw HTML — safe against XSS. */}
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                {message.isEdited && <span className="edited muted">(edited)</span>}
              </div>
            );
          })()
        )}
      </div>
      {own && !message.isDeleted && !pending && (
        <button className="message-action" title="Delete" onClick={onDelete}>
          ✕
        </button>
      )}
    </div>
  );
}
