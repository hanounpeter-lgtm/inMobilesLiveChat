import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ChannelSummary } from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { useUnreads } from '../lib/unreads';
import { useChatStore } from '../lib/chat-store';
import type { DirectoryUser } from '../lib/users';

/** Landing "Home" view: greeting, live clock, who's online, and unread summary. */
export default function HomeDashboard({ channels }: { channels: ChannelSummary[] }) {
  const me = useAuth((s) => s.user);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const { unreads } = useUnreads();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => api<{ users: DirectoryUser[] }>('/users'),
  });
  const online = (usersData?.users ?? []).filter((u) => u.online && u.id !== me?.id);

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const timeStr = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  const nameById = new Map(channels.map((c) => [c.id, c]));
  const unreadChannels = Object.values(unreads)
    .filter((u) => u.hasUnread || u.mentionCount > 0)
    .map((u) => ({ ...u, channel: nameById.get(u.channelId) }))
    .filter((u) => u.channel);

  const chLabel = (c: ChannelSummary) =>
    c.type === 'dm' || c.type === 'group_dm'
      ? c.memberPreviews?.map((m) => m.displayName).join(', ') || 'DM'
      : `# ${c.name}`;

  return (
    <div className="home-dashboard">
      <div className="home-header">
        <h1>
          {greeting}, {me?.displayName?.split(' ')[0]}
        </h1>
        <div className="home-clock">{timeStr}</div>
      </div>

      <div className="home-grid">
        <section className="home-card">
          <h3>Jump back in</h3>
          {unreadChannels.length === 0 ? (
            <p className="muted">You're all caught up 🎉</p>
          ) : (
            unreadChannels.map((u) => (
              <button key={u.channelId} className="home-unread" onClick={() => setActiveChannel(u.channelId)}>
                <span>{chLabel(u.channel!)}</span>
                {u.mentionCount > 0 && <span className="unread-badge">{u.mentionCount}</span>}
              </button>
            ))
          )}
        </section>

        <section className="home-card">
          <h3>Online now · {online.length}</h3>
          {online.length === 0 ? (
            <p className="muted">Nobody else is online</p>
          ) : (
            <div className="home-online">
              {online.slice(0, 24).map((u) => (
                <span key={u.id} className="home-person" title={u.displayName}>
                  <span className="presence-dot online" />
                  {u.displayName}
                </span>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
