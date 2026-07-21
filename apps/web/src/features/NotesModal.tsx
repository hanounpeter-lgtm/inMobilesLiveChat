import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ChannelNoteDto } from '@inmobiles/shared-types';
import { api } from '../lib/api';

/** Shared collaborative note for a channel — everyone can edit and save. */
export default function NotesModal({
  channelId,
  channelName,
  onClose,
}: {
  channelId: string;
  channelName: string;
  onClose: () => void;
}) {
  const [content, setContent] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const { data } = useQuery({
    queryKey: ['note', channelId],
    queryFn: () => api<ChannelNoteDto>(`/channels/${channelId}/note`),
  });
  useEffect(() => {
    if (data && !loaded) {
      setContent(data.content);
      setLoaded(true);
    }
  }, [data, loaded]);

  const save = async () => {
    setBusy(true);
    await api(`/channels/${channelId}/note`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }).catch(() => undefined);
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal notes-modal">
        <h3 className="modal-title">Notes · #{channelName}</h3>
        <textarea
          className="notes-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Shared notes for this channel — meeting notes, links, decisions…"
        />
        {data?.updatedBy && (
          <div className="muted notes-meta">Last edited by {data.updatedBy}</div>
        )}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <button className="btn-primary" disabled={busy} onClick={() => void save()}>
            {saved ? 'Saved ✓' : busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
