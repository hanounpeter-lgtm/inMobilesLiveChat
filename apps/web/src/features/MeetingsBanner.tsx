import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeetingDto } from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { IconCalendar } from '../components/icons';

const fmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** Upcoming scheduled meetings for a channel. */
export default function MeetingsBanner({ channelId }: { channelId: string }) {
  const queryClient = useQueryClient();
  const me = useAuth((s) => s.user);
  const { data } = useQuery({
    queryKey: ['meetings', channelId],
    queryFn: () => api<{ meetings: MeetingDto[] }>(`/channels/${channelId}/meetings`),
  });

  const upcoming = (data?.meetings ?? []).filter((m) => new Date(m.scheduledAt).getTime() > Date.now());
  if (upcoming.length === 0) return null;

  const cancel = async (id: string) => {
    await api(`/meetings/${id}`, { method: 'DELETE' }).catch(() => undefined);
    void queryClient.invalidateQueries({ queryKey: ['meetings', channelId] });
  };

  return (
    <div className="meetings-banner">
      {upcoming.map((m) => (
        <div key={m.id} className="meeting-row">
          <IconCalendar size={15} />
          <span className="meeting-title">{m.title}</span>
          <span className="muted meeting-time">{fmt.format(new Date(m.scheduledAt))}</span>
          <span className="muted meeting-by">· {m.createdBy.displayName}</span>
          {m.createdBy.id === me?.id && (
            <button className="meeting-cancel" onClick={() => void cancel(m.id)}>
              Cancel
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
