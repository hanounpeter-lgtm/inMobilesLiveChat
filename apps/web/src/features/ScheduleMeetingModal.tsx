import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MeetingDto } from '@inmobiles/shared-types';
import { api } from '../lib/api';

/** Schedule an audio/video meeting in a channel for a future time. */
export default function ScheduleMeetingModal({
  channelId,
  onClose,
}: {
  channelId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const [type, setType] = useState<'video' | 'audio'>('video');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const submit = async () => {
    if (!title.trim() || !when) return;
    const scheduledAt = new Date(when);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now()) {
      setError('Pick a time in the future');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api<MeetingDto>(`/channels/${channelId}/meetings`, {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          type,
          scheduledAt: scheduledAt.toISOString(),
        }),
      });
      void queryClient.invalidateQueries({ queryKey: ['meetings', channelId] });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not schedule');
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3 className="modal-title">Schedule a meeting</h3>
        <label className="field">
          Title
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Sprint planning"
            maxLength={120}
          />
        </label>
        <label className="field">
          Date & time
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <label className="field">
          Type
          <select value={type} onChange={(e) => setType(e.target.value as 'video' | 'audio')}>
            <option value="video">Video call</option>
            <option value="audio">Audio call</option>
          </select>
        </label>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || !title.trim() || !when} onClick={() => void submit()}>
            {busy ? 'Scheduling…' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
