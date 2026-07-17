import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClockAction, TimeclockMe, TimeclockTeamEntry } from '@inmobiles/shared-types';
import { api } from '../lib/api';

const fmtDur = (ms: number) => {
  const minutes = Math.floor(ms / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const STATUS_LABEL = { off: 'Clocked out', working: 'Working', break: 'On break' } as const;

export function TimeclockWidget() {
  const queryClient = useQueryClient();
  const [showTeam, setShowTeam] = useState(false);
  const [, forceTick] = useState(0);

  const me = useQuery({
    queryKey: ['timeclock', 'me'],
    queryFn: () => api<TimeclockMe>('/timeclock/me'),
    refetchInterval: 60_000,
  });

  // Tick the elapsed display every 30s while clocked in.
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const act = useMutation({
    mutationFn: (action: ClockAction) =>
      api<TimeclockMe>(`/timeclock/${action}`, { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.setQueryData(['timeclock', 'me'], data);
      void queryClient.invalidateQueries({ queryKey: ['timeclock', 'team'] });
    },
  });

  const data = me.data;
  const status = data?.status ?? 'off';
  const liveExtra =
    data && data.since && status !== 'off' ? Date.now() - new Date(data.since).getTime() : 0;
  // Server totals are as-of fetch time; extend live while working.
  const workedLive =
    (data?.workedMsToday ?? 0) +
    (status === 'working' ? Math.max(0, Date.now() - me.dataUpdatedAt) : 0);

  return (
    <div className="timeclock">
      <div className="timeclock-status">
        <span className={`clock-dot clock-${status}`} />
        <span className="timeclock-label">{STATUS_LABEL[status]}</span>
        {data && (data.workedMsToday > 0 || status !== 'off') && (
          <span className="timeclock-total" title="Worked today (breaks excluded)">
            {fmtDur(workedLive)}
          </span>
        )}
        <button className="icon-btn timeclock-team-btn" onClick={() => setShowTeam(true)}>
          Team
        </button>
      </div>
      <div className="timeclock-actions">
        {status === 'off' && (
          <button
            className="clock-btn clock-btn-primary"
            disabled={act.isPending}
            onClick={() => act.mutate('clock-in')}
          >
            Clock in
          </button>
        )}
        {status === 'working' && (
          <>
            <button
              className="clock-btn"
              disabled={act.isPending}
              onClick={() => act.mutate('break-start')}
            >
              Break
            </button>
            <button
              className="clock-btn clock-btn-out"
              disabled={act.isPending}
              onClick={() => act.mutate('clock-out')}
            >
              Clock out
            </button>
          </>
        )}
        {status === 'break' && (
          <>
            <button
              className="clock-btn clock-btn-primary"
              disabled={act.isPending}
              onClick={() => act.mutate('break-end')}
            >
              Resume
            </button>
            <button
              className="clock-btn clock-btn-out"
              disabled={act.isPending}
              onClick={() => act.mutate('clock-out')}
            >
              Clock out
            </button>
          </>
        )}
      </div>
      {liveExtra > 0 && status === 'break' && (
        <div className="timeclock-sub muted">on break for {fmtDur(liveExtra)}</div>
      )}
      {showTeam && <TeamClockModal onClose={() => setShowTeam(false)} />}
    </div>
  );
}

function TeamClockModal({ onClose }: { onClose: () => void }) {
  const team = useQuery({
    queryKey: ['timeclock', 'team'],
    queryFn: () => api<{ team: TimeclockTeamEntry[] }>('/timeclock/team'),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const rows = team.data?.team ?? [];
  const order = { working: 0, break: 1, off: 2 } as const;
  const sorted = [...rows].sort((a, b) => order[a.status] - order[b.status]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal team-clock-modal">
        <h3 className="modal-title">Who's working</h3>
        <div className="member-list">
          {sorted.map((entry) => (
            <div key={entry.userId} className="member-row">
              {entry.avatarUrl ? (
                <img className="me-avatar" src={entry.avatarUrl} alt="" />
              ) : (
                <span className={`clock-dot clock-${entry.status}`} />
              )}
              <span className="member-name">{entry.displayName}</span>
              {entry.since && entry.status !== 'off' && (
                <span className="muted clock-since">
                  {fmtDur(Date.now() - new Date(entry.since).getTime())}
                </span>
              )}
              <span className={`clock-chip clock-chip-${entry.status}`}>
                {STATUS_LABEL[entry.status]}
              </span>
            </div>
          ))}
          {team.isLoading && <div className="muted pad-sm">Loading…</div>}
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
