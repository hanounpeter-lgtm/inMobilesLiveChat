import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ChannelSummary } from '@inmobiles/shared-types';
import { api } from '../lib/api';

function label(c: ChannelSummary): string {
  if (c.type === 'dm' || c.type === 'group_dm') {
    return c.memberPreviews?.map((m) => m.displayName).join(', ') || 'Direct message';
  }
  return `# ${c.name}`;
}

/** Send one message to many channels/DMs at once (📣). */
export default function BroadcastModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const channels = queryClient.getQueryData<{ channels: ChannelSummary[] }>(['channels'])?.channels ?? [];
  const targets = useMemo(
    () => channels.filter((c) => !c.isArchived).sort((a, b) => label(a).localeCompare(label(b))),
    [channels],
  );

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const send = async () => {
    if (!text.trim() || picked.size === 0) return;
    setBusy(true);
    const res = await api<{ sent: number }>('/broadcast', {
      method: 'POST',
      body: JSON.stringify({ channelIds: [...picked], text: text.trim() }),
    }).catch(() => ({ sent: 0 }));
    setSentCount(res.sent);
    setBusy(false);
    setTimeout(onClose, 1200);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal directory-modal">
        <h3 className="modal-title">📣 Broadcast a message</h3>
        {sentCount !== null ? (
          <div className="reset-result">Sent to {sentCount} conversation{sentCount === 1 ? '' : 's'} ✓</div>
        ) : (
          <>
            <textarea
              className="broadcast-text"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What do you want to announce?"
              rows={3}
            />
            <div className="broadcast-hint muted">Select where to send it ({picked.size} selected):</div>
            <div className="directory-list">
              {targets.map((c) => (
                <label key={c.id} className="broadcast-target">
                  <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                  <span className="channel-label">{label(c)}</span>
                </label>
              ))}
            </div>
          </>
        )}
        {sentCount === null && (
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" disabled={busy || !text.trim() || picked.size === 0} onClick={() => void send()}>
              {busy ? 'Sending…' : `Send to ${picked.size}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
