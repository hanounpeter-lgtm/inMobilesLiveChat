import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MessageDto } from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { parseSticker } from './stickers';

const GIF_RE = /^!\[GIF\]\((.+)\)$/;
const AUDIO_RE = /^\[(recording|voice):[0-9a-f-]{36}\]$/;

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
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Note: no scroll-close — programmatic list scrolls (auto-stick, edits)
    // would dismiss the menu the instant it opens.
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
  const isSticker = parseSticker(content) !== null;
  const isAudio = AUDIO_RE.test(content);
  const isPlainText = !message.isDeleted && !gifMatch && !isSticker && !isAudio;

  const own = user?.id === message.author.id;
  const isWorkspaceAdmin = user?.role === 'owner' || user?.role === 'admin';
  const canEdit = own && isPlainText;
  const canDelete = !message.isDeleted && (own || isWorkspaceAdmin);
  const copyValue = gifMatch ? gifMatch[1] : isPlainText ? message.content : null;

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

  const remove = () => {
    onClose();
    if (window.confirm('Delete this message?')) {
      void api(`/messages/${message.id}`, { method: 'DELETE' }).catch(() => undefined);
    }
  };

  return (
    <div className="context-menu" ref={ref} style={{ left: pos.x, top: pos.y }}>
      {copyValue && (
        <button onClick={() => void copy()}>
          {copied ? '✓ Copied' : gifMatch ? 'Copy GIF link' : 'Copy text'}
        </button>
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
      {!copyValue && !canEdit && !canDelete && (
        <button disabled className="muted">
          No actions available
        </button>
      )}
    </div>
  );
}
