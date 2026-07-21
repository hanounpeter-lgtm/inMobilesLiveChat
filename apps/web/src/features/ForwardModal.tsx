import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ChannelSummary, MessageDto } from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { useChatStore } from '../lib/chat-store';

function label(c: ChannelSummary): string {
  if (c.type === 'dm' || c.type === 'group_dm') {
    return c.memberPreviews?.map((m) => m.displayName).join(', ') || 'Direct message';
  }
  return `# ${c.name}`;
}

export default function ForwardModal({ message }: { message: MessageDto }) {
  const queryClient = useQueryClient();
  const setForwardMessage = useChatStore((s) => s.setForwardMessage);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = () => setForwardMessage(null);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const channels = queryClient.getQueryData<{ channels: ChannelSummary[] }>(['channels'])?.channels ?? [];
  const targets = useMemo(() => {
    const term = q.trim().toLowerCase();
    return channels
      .filter((c) => !c.isArchived)
      .filter((c) => !term || label(c).toLowerCase().includes(term))
      .sort((a, b) => label(a).localeCompare(label(b)));
  }, [channels, q]);

  const doForward = async (channelId: string) => {
    setBusyId(channelId);
    setError(null);
    try {
      await api<MessageDto>(`/messages/${message.id}/forward`, {
        method: 'POST',
        body: JSON.stringify({ channelId }),
      });
      setDone(channelId);
      setTimeout(() => {
        setActiveChannel(channelId);
        close();
      }, 500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not forward');
      setBusyId(null);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal directory-modal">
        <h3 className="modal-title">Forward message</h3>
        <div className="forward-preview muted">{message.content.slice(0, 140) || '(attachment)'}</div>
        <input
          className="directory-search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Forward to a channel or person…"
        />
        <div className="directory-list">
          {targets.length === 0 && <div className="muted directory-empty">No conversations</div>}
          {targets.map((c) => (
            <button
              key={c.id}
              className="channel-item forward-target"
              disabled={busyId !== null}
              onClick={() => void doForward(c.id)}
            >
              <span className="channel-label">{label(c)}</span>
              {done === c.id ? (
                <span className="forward-ok">Forwarded ✓</span>
              ) : busyId === c.id ? (
                <span className="muted">Sending…</span>
              ) : null}
            </button>
          ))}
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
