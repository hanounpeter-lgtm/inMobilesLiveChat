import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminStatsDto,
  CalendarEventDto,
  ChannelSummary,
  TaskDto,
} from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { useUnreads } from '../lib/unreads';
import { useChatStore } from '../lib/chat-store';
import type { DirectoryUser } from '../lib/users';
import {
  IconAt,
  IconCalendar,
  IconCheck,
  IconChart,
  IconFile,
  IconMegaphone,
  IconPlus,
  IconTarget,
  IconUsers,
  IconX,
  IconSearch,
  IconStar,
  IconUserPlus,
  IconHash,
} from '../components/icons';

const FOCUS_KEY = 'inchat-focus-until';

export default function HomeDashboard({ channels }: { channels: ChannelSummary[] }) {
  const me = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const openModal = useChatStore((s) => s.openModal);
  const isAdmin = me?.role === 'owner' || me?.role === 'admin';
  const { unreads } = useUnreads();
  const [now, setNow] = useState(() => new Date());
  const [draft, setDraft] = useState('');
  const [focusUntil, setFocusUntil] = useState<number | null>(() => {
    const v = Number(localStorage.getItem(FOCUS_KEY));
    return v && v > Date.now() ? v : null;
  });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(t);
  }, []);

  // ── Focus mode: timed busy status that auto-reverts ──
  const setStatus = async (text: string) => {
    await api('/users/me', { method: 'PATCH', body: JSON.stringify({ statusText: text }) }).catch(() => undefined);
    useAuth.setState((s) => ({ user: s.user ? { ...s.user, statusText: text || null } : s.user }));
  };
  const startFocus = (mins: number) => {
    const until = Date.now() + mins * 60_000;
    localStorage.setItem(FOCUS_KEY, String(until));
    setFocusUntil(until);
    const t = new Date(until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    void setStatus(`🎯 Focusing until ${t}`);
  };
  const endFocus = () => {
    localStorage.removeItem(FOCUS_KEY);
    setFocusUntil(null);
    void setStatus('');
  };
  useEffect(() => {
    if (!focusUntil) return;
    const t = setInterval(() => {
      if (Date.now() >= focusUntil) endFocus();
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusUntil]);
  const focusLeft = focusUntil ? Math.max(0, Math.ceil((focusUntil - now.getTime()) / 60000)) : 0;

  // ── Data ──
  const { data: usersData } = useQuery({ queryKey: ['users'], queryFn: () => api<{ users: DirectoryUser[] }>('/users') });
  const online = (usersData?.users ?? []).filter((u) => u.online && u.id !== me?.id);

  const { data: tasksData } = useQuery({ queryKey: ['my-tasks'], queryFn: () => api<{ tasks: TaskDto[] }>('/me/tasks') });
  const tasks = tasksData?.tasks ?? [];
  const openTasks = tasks.filter((t) => !t.done);
  const refreshTasks = () => queryClient.invalidateQueries({ queryKey: ['my-tasks'] });

  const { data: calData } = useQuery({ queryKey: ['calendar'], queryFn: () => api<{ events: CalendarEventDto[] }>('/calendar/events') });
  const events = (calData?.events ?? []).filter((e) => new Date(e.startAt).getTime() > Date.now()).slice(0, 3);

  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api<AdminStatsDto>('/admin/stats'),
    enabled: isAdmin,
  });

  const openDm = useMutation({
    mutationFn: (memberId: string) =>
      api<ChannelSummary>('/channels/dm', { method: 'POST', body: JSON.stringify({ memberIds: [memberId] }) }),
    onSuccess: (c) => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      setActiveChannel(c.id);
    },
  });

  const addTask = async () => {
    if (!draft.trim()) return;
    setDraft('');
    await api('/tasks', { method: 'POST', body: JSON.stringify({ title: draft.trim() }) }).catch(() => undefined);
    void refreshTasks();
  };
  const toggleTask = async (t: TaskDto) => {
    await api(`/tasks/${t.id}`, { method: 'PATCH', body: JSON.stringify({ done: !t.done }) }).catch(() => undefined);
    void refreshTasks();
  };
  const delTask = async (t: TaskDto) => {
    await api(`/tasks/${t.id}`, { method: 'DELETE' }).catch(() => undefined);
    void refreshTasks();
  };

  const joinByCode = async () => {
    const code = window.prompt('Enter meeting code:')?.trim();
    if (!code) return;
    try {
      const meeting = await api<any>(`/meetings/by-code/${encodeURIComponent(code)}`);
      setActiveChannel(meeting.channelId);
      const join = await api<any>(`/channels/${meeting.channelId}/call`, {
        method: 'POST',
        body: JSON.stringify({ type: meeting.type }),
      });
      useChatStore.getState().setCurrentCall(join);
    } catch {
      window.alert('No meeting found for that code.');
    }
  };

  const focusMode = async () => {
    const raw = window.prompt('Focus for how many minutes?', '30');
    const mins = Number(raw);
    if (!mins || mins <= 0) return;
    startFocus(mins);
  };

  const nameById = new Map(channels.map((c) => [c.id, c]));
  const chLabel = (c: ChannelSummary) =>
    c.type === 'dm' || c.type === 'group_dm'
      ? c.memberPreviews?.map((m) => m.displayName).join(', ') || 'DM'
      : `# ${c.name}`;
  const unreadChannels = useMemo(
    () =>
      Object.values(unreads)
        .filter((u) => u.hasUnread || u.mentionCount > 0)
        .map((u) => ({ ...u, channel: nameById.get(u.channelId) }))
        .filter((u) => u.channel)
        .slice(0, 5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unreads, channels],
  );
  const unreadTotal = unreadChannels.reduce((a, u) => a + (u.mentionCount || 1), 0);

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const maxA = Math.max(1, ...(stats?.activity ?? []).map((a) => a.messages));

  return (
    <div className="home-dashboard">
      <div className="bento">
        {/* HERO */}
        <div className="bento-tile hero span-4">
          <p className="hero-date">
            {dateStr} <span className="dot">·</span> <span className="tabular">{timeStr}</span>
          </p>
          <h1 className="hero-greeting">
            {greeting}, {me?.displayName?.split(' ')[0] || 'there'}
          </h1>
          <p className="hero-summary muted">
            {unreadChannels.length > 0 ? `${unreadTotal} unread waiting` : 'Inbox clear.'}
            {openTasks.length > 0 && ` · ${openTasks.length} task${openTasks.length === 1 ? '' : 's'} open`}
            {online.length > 0 && ` · ${online.length} online`}
          </p>
          <div className="hero-actions">
            <button className="btn-primary" onClick={() => openModal('directory')}>
              New chat
            </button>
            <button className="btn-secondary" onClick={() => openModal('broadcast')}>
              <IconMegaphone size={14} /> Broadcast
            </button>
            <button className="btn-secondary" onClick={() => openModal('calendar')}>
              <IconCalendar size={14} /> Schedule
            </button>
          </div>
        </div>

        {/* FOCUS MODE */}
        <div className={`bento-tile span-2 ${focusUntil ? 'focus-active' : ''}`}>
          <div className="tile-label">
            <IconTarget size={15} /> Focus mode
          </div>
          {focusUntil ? (
            <div className="focus-live">
              <p className="focus-count">
                {focusLeft}
                <span>m</span>
              </p>
              <p className="muted small">You're set to Busy. Status restores automatically.</p>
              <button className="btn-secondary focus-end" onClick={endFocus}>
                End early
              </button>
            </div>
          ) : (
            <>
              <p className="muted small focus-hint">Go heads-down — we'll set you Busy and restore it after.</p>
              <div className="focus-buttons">
                {[25, 50, 90].map((m) => (
                  <button key={m} className="focus-btn" onClick={() => startFocus(m)}>
                    {m}m
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* WHO'S AROUND */}
        <div className="bento-tile span-2">
          <div className="tile-label">
            <IconUsers size={15} /> Who's around
            <span className="tile-count">{online.length} online</span>
          </div>
          {online.length === 0 ? (
            <p className="muted small">Nobody else is online right now.</p>
          ) : (
            <div className="around-list">
              {online.slice(0, 12).map((u) => (
                <button key={u.id} className="around-person" title={u.displayName} onClick={() => openDm.mutate(u.id)}>
                  {u.avatarUrl ? (
                    <img src={u.avatarUrl} alt="" />
                  ) : (
                    <span className="around-initial">{u.displayName.slice(0, 1).toUpperCase()}</span>
                  )}
                  <span className="presence-dot online" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* MY TASKS */}
        <div className="bento-tile span-3">
          <div className="tile-label">
            <IconCheck size={15} /> My tasks
            <span className="tile-count">{openTasks.length} open</span>
          </div>
          <div className="task-add">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addTask()}
              placeholder="Add a to-do…"
            />
            <button className="btn-primary" onClick={() => void addTask()}>
              <IconPlus size={16} />
            </button>
          </div>
          {tasks.length === 0 ? (
            <p className="muted small">Nothing yet — add your first to-do.</p>
          ) : (
            <div className="home-tasklist">
              {tasks.slice(0, 6).map((t) => (
                <div key={t.id} className={`home-task${t.done ? ' done' : ''}`}>
                  <input type="checkbox" checked={t.done} onChange={() => void toggleTask(t)} />
                  <span className="home-task-title">{t.title}</span>
                  <button className="home-task-del" onClick={() => void delTask(t)} title="Delete">
                    <IconX size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* NEEDS YOUR REPLY */}
        <div className="bento-tile span-3">
          <div className="tile-label">
            <IconAt size={15} /> Needs your reply
            <button className="tile-link" onClick={() => openModal('activity')}>
              See all
            </button>
          </div>
          {unreadChannels.length === 0 ? (
            <p className="muted small">✨ You're all caught up.</p>
          ) : (
            <div className="reply-list">
              {unreadChannels.map((u) => (
                <button key={u.channelId} className="reply-row" onClick={() => setActiveChannel(u.channelId)}>
                  <span className="reply-name">{chLabel(u.channel!)}</span>
                  {u.mentionCount > 0 && <span className="unread-badge">{u.mentionCount}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* UPCOMING */}
        <div className="bento-tile span-4">
          <div className="tile-label">
            <IconCalendar size={15} /> Upcoming
            <button className="tile-link" onClick={() => openModal('calendar')}>
              Schedule
            </button>
          </div>
          {events.length === 0 ? (
            <p className="muted small">Nothing scheduled.</p>
          ) : (
            <div className="upcoming-list">
              {events.map((ev) => (
                <div key={ev.id} className="upcoming-row">
                  <div className="upcoming-meta">
                    <span className="upcoming-title">{ev.title}</span>
                    <span className="muted small">
                      {new Date(ev.startAt).toLocaleString(undefined, {
                        weekday: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}{' '}
                      · {ev.createdBy.displayName}
                    </span>
                  </div>
                  {ev.myStatus && <span className={`event-status ${ev.myStatus}`}>{ev.myStatus}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* APPS */}
        <div className="bento-tile span-4" style={{ marginTop: '4px' }}>
          <div className="tile-label">Apps & Tools</div>
          <div className="premium-apps-grid">
            {[
              { icon: <IconSearch size={22} />, label: 'Search', fn: () => openModal('search') },
              { icon: <IconAt size={22} />, label: 'Activity', fn: () => openModal('activity') },
              { icon: <IconUsers size={22} />, label: 'Directory', fn: () => openModal('directory') },
              { icon: <IconStar size={22} />, label: 'Saved', fn: () => openModal('saved') },
              { icon: <IconUserPlus size={22} />, label: 'Invites', fn: () => openModal('invites') },
              { icon: <IconCheck size={22} />, label: 'Tasks', fn: () => openModal('tasks') },
              { icon: <IconCalendar size={22} />, label: 'Calendar', fn: () => openModal('calendar') },
              { icon: <IconFile size={22} />, label: 'Files', fn: () => openModal('files') },
              { icon: <IconMegaphone size={22} />, label: 'Broadcast', fn: () => openModal('broadcast') },
              { icon: <IconHash size={22} />, label: 'Join code', fn: () => void joinByCode() },
              { icon: <IconTarget size={22} />, label: 'Focus', fn: () => void focusMode() },
              ...(isAdmin ? [{ icon: <IconChart size={22} />, label: 'Admin', fn: () => openModal('admin') }] : []),
            ].map((s) => (
              <button key={s.label} className="premium-app-card" onClick={s.fn} title={s.label}>
                <div className="premium-app-icon">{s.icon}</div>
                <span className="premium-app-label">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* WORKSPACE ACTIVITY (admins) */}
        {isAdmin && stats && (
          <div className="bento-tile span-4">
            <div className="tile-label">
              <IconChart size={15} /> Workspace activity
              <span className="tile-count">{stats.totals.messages} messages</span>
            </div>
            <div className="admin-chart home-chart">
              {stats.activity.map((a) => (
                <div key={a.date} className="chart-col" title={`${a.date}: ${a.messages}`}>
                  <div className="chart-bar" style={{ height: `${(a.messages / maxA) * 100}%` }} />
                  <span className="chart-label">{a.date.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
