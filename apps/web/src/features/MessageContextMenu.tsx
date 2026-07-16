import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FileUrlResponse, MessageDto } from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { useChatStore } from '../lib/chat-store';
import { parseSticker } from './stickers';

const GIF_RE = /^!\[GIF\]\((.+)\)$/;
const AUDIO_RE = /^\[(recording|voice):([0-9a-f-]{36})\]$/;
const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '👀'];

export interface MenuState {
  x: number;
  y: number;
  message: MessageDto;
}

export default function MessageContextMenu({
  menu,
  onClose,
  onStartEdit,
}: {
  menu: MenuState;
  onClose: () => void;
  onStartEdit: (message: MessageDto) => void;
}) {
  const user = useAuth((s) => s.user);
  const setComposerInsert = useChatStore((s) => s.setComposerInsert);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });
  const [copied, setCopied] = useState(false);

  // Clamp to the viewport once we know the menu's real size.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      x: Math.min(menu.x, window.innerWidth - width - 8),
      y: Math.min(menu.y, window.innerHeight - height - 8),
    });
  }, [menu.x, menu.y]);

  useEffect(() => {
    // Note: no scroll-close — programmatic list scrolls (auto-stick, edits)
    // would dismiss the menu the instant it opens.
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  const { message } = menu;
  const content = message.content.trim();
  const gifMatch = GIF_RE.exec(content);
  const audioMatch = AUDIO_RE.exec(content);
  const isSticker = parseSticker(content) !== null;
  const isPlainText = !message.isDeleted && !gifMatch && !isSticker && !audioMatch;

  const own = user?.id === message.author.id;
  const isWorkspaceAdmin = user?.role === 'owner' || user?.role === 'admin';
  const canEdit = own && isPlainText;
  const canDelete = !message.isDeleted && (own || isWorkspaceAdmin);
  const copyValue = gifMatch ? gifMatch[1] : isPlainText ? message.content : null;

  const react = (emoji: string) => {
    onClose();
    void api(`/messages/${message.id}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    }).catch(() => undefined);
  };

  const copy = async () => {
    if (!copyValue) return;
    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
      setTimeout(onClose, 450);
    } catch {
      onClose();
    }
  };

  const quote = () => {
    onClose();
    const quoted = message.content
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    setComposerInsert(`${quoted}\n`);
  };

  const togglePin = () => {
    onClose();
    void api(`/messages/${message.id}/pin`, { method: 'POST' }).catch(() => undefined);
  };

  const download = async () => {
    onClose();
    if (!audioMatch) return;
    try {
      const res = await api<FileUrlResponse>(`/files/${audioMatch[2]}/url`);
      const a = document.createElement('a');
      a.href = res.url;
      a.download = `${audioMatch[1]}.webm`;
      a.click();
    } catch {
      /* file gone */
    }
  };

  const remove = () => {
    onClose();
    if (window.confirm('Delete this message?')) {
      void api(`/messages/${message.id}`, { method: 'DELETE' }).catch(() => undefined);
    }
  };

  return (
    <div className="context-menu" ref={ref} style={{ left: pos.x, top: pos.y }}>
      {!message.isDeleted && (
        <div className="quick-reactions">
          {QUICK_REACTIONS.map((emoji) => (
            <button key={emoji} title={`React ${emoji}`} onClick={() => react(emoji)}>
              {emoji}
            </button>
          ))}
        </div>
      )}
      {copyValue && (
        <button onClick={() => void copy()}>
          {copied ? '✓ Copied' : gifMatch ? 'Copy GIF link' : 'Copy text'}
        </button>
      )}
      {isPlainText && <button onClick={quote}>Quote reply</button>}
      {audioMatch && <button onClick={() => void download()}>Download audio</button>}
      {!message.isDeleted && (
        <button onClick={togglePin}>{message.isPinned ? 'Unpin message' : 'Pin message'}</button>
      )}
      {canEdit && (
        <button
          onClick={() => {
            onClose();
            onStartEdit(message);
          }}
        >
          Edit message
        </button>
      )}
      {canDelete && (
        <button className="menu-danger" onClick={remove}>
          Delete message
        </button>
      )}
    </div>
  );
}
