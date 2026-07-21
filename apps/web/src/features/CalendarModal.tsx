import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CalendarEventDto } from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-store';

const fmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** Team calendar — upcoming events with invite accept/decline. */
export default function CalendarModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const me = useAuth((s) => s.user);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const { data } = useQuery({ queryKey: ['calendar'], queryFn: () => api<{ events: CalendarEventDto[] }>('/calendar/events') });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['calendar'] });

  const create = async () => {
    if (!title.trim() || !start) return;
    await api('/calendar/events', {
      method: 'POST',
      body: JSON.stringify({ title: title.trim(), startAt: new Date(start).toISOString() }),
    }).catch(() => undefined);
    setTitle('');
    setStart('');
    setCreating(false);
    void refresh();
  };
  const respond = async (ev: CalendarEventDto, status: 'accepted' | 'declined') => {
    await api(`/calendar/events/${ev.id}/respond`, { method: 'POST', body: JSON.stringify({ status }) }).catch(() => undefined);
    void refresh();
  };
  const remove = async (ev: CalendarEventDto) => {
    await api(`/calendar/events/${ev.id}`, { method: 'DELETE' }).catch(() => undefined);
    void refresh();
  };

  const events = (data?.events ?? []).filter((e) => new Date(e.startAt).getTime() > Date.now() - 3600_000);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal directory-modal">
        <h3 className="modal-title">Calendar</h3>
        {creating ? (
          <div className="event-create">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" autoFocus />
            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            <div className="event-create-actions">
              <button className="btn-secondary" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={() => void create()}>
                Create
              </button>
            </div>
          </div>
        ) : (
          <button className="btn-primary event-new-btn" onClick={() => setCreating(true)}>
            + New event
          </button>
        )}
        <div className="directory-list">
          {events.length === 0 && <div className="muted directory-empty">No upcoming events</div>}
          {events.map((ev) => (
            <div key={ev.id} className="event-row">
              <div className="event-meta">
                <span className="event-title">{ev.title}</span>
                <span className="event-sub muted">
                  {fmt.format(new Date(ev.startAt))} · {ev.createdBy.displayName}
                </span>
                <span className="event-attendees muted">
                  {ev.attendees.filter((a) => a.status === 'accepted').length} going
                </span>
              </div>
              <div className="event-actions">
                {ev.createdBy.id === me?.id ? (
                  <button className="btn-secondary" onClick={() => void remove(ev)}>
                    Delete
                  </button>
                ) : (
                  <>
                    <button
                      className={`event-resp${ev.myStatus === 'declined' ? ' active' : ''}`}
                      onClick={() => void respond(ev, 'declined')}
                    >
                      Decline
                    </button>
                    <button
                      className={`event-resp accept${ev.myStatus === 'accepted' ? ' active' : ''}`}
                      onClick={() => void respond(ev, 'accepted')}
                    >
                      Accept
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
