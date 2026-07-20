import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClockAction,
  TimeclockHistoryResponse,
  TimeclockMe,
  TimeclockTeamEntry,
} from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-store';

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
  const [showHistory, setShowHistory] = useState(false);
  const user = useAuth((s) => s.user);
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
        <button className="icon-btn timeclock-team-btn" onClick={() => setShowHistory(true)}>
          History
        </button>
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
      {showHistory && user && (
        <TimeclockHistoryModal userId={user.id} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}

const dayLabelFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const clockTimeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

export function TimeclockHistoryModal({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const history = useQuery({
    queryKey: ['timeclock', 'history', userId],
    queryFn: () =>
      api<TimeclockHistoryResponse>(`/timeclock/history?userId=${userId}&days=14`),
  });

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const entries = history.data?.entries ?? [];
  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal history-modal">
        <h3 className="modal-title">
          {history.data ? `${history.data.displayName} — last 14 days` : 'Work history'}
        </h3>
        <div className="history-table">
          <div className="history-row history-head">
            <span>Day</span>
            <span>In</span>
            <span>Out</span>
            <span>Worked</span>
            <span>Break</span>
          </div>
          {entries.map((e) => (
            <div key={e.date} className="history-row">
              <span>
                {e.date === todayKey ? 'Today' : dayLabelFmt.format(new Date(`${e.date}T12:00:00Z`))}
              </span>
              <span>{e.firstIn ? clockTimeFmt.format(new Date(e.firstIn)) : '—'}</span>
              <span>{e.lastOut ? clockTimeFmt.format(new Date(e.lastOut)) : '—'}</span>
              <span className="history-worked">{fmtDur(e.workedMs)}</span>
              <span className="muted">{e.breakMs > 0 ? fmtDur(e.breakMs) : '—'}</span>
            </div>
          ))}
          {history.isLoading && <div className="muted pad-sm">Loading…</div>}
          {history.isSuccess && entries.length === 0 && (
            <div className="muted pad-sm">No clock activity in the last 14 days.</div>
          )}
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

function TeamClockModal({ onClose }: { onClose: () => void }) {
  const user = useAuth((s) => s.user);
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';
  const [historyFor, setHistoryFor] = useState<string | null>(null);
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
          {sorted.map((entry) => {
            const canViewHistory = isAdmin || entry.userId === user?.id;
            return (
              <button
                key={entry.userId}
                className="member-row team-clock-row"
                disabled={!canViewHistory}
                title={canViewHistory ? 'View work history' : undefined}
                onClick={() => canViewHistory && setHistoryFor(entry.userId)}
              >
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
              </button>
            );
          })}
          {team.isLoading && <div className="muted pad-sm">Loading…</div>}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        {historyFor && (
          <TimeclockHistoryModal userId={historyFor} onClose={() => setHistoryFor(null)} />
        )}
      </div>
    </div>
  );
}
