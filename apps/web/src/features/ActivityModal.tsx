import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ChannelSummary, NotificationDto } from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { useChatStore } from '../lib/chat-store';
import { useUsersById } from '../lib/users';
import { stripMentionTokens } from '../lib/mention-format';
import { useQueryClient } from '@tanstack/react-query';

const timeFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export default function ActivityModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const usersById = useUsersById();

  const activity = useQuery({
    queryKey: ['activity'],
    queryFn: () => api<{ notifications: NotificationDto[] }>('/me/notifications'),
  });

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const channelName = (channelId: string | null) => {
    if (!channelId) return '';
    const channels =
      queryClient.getQueryData<{ channels: ChannelSummary[] }>(['channels'])?.channels ?? [];
    const channel = channels.find((c) => c.id === channelId);
    if (!channel) return 'a channel';
    if (channel.type === 'dm' || channel.type === 'group_dm') return 'a direct message';
    return `#${channel.name}`;
  };

  const open = (n: NotificationDto) => {
    if (n.channelId) setActiveChannel(n.channelId);
    onClose();
  };

  const rows = activity.data?.notifications ?? [];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal activity-modal">
        <h3 className="modal-title">＠ Activity</h3>
        <div className="activity-list">
          {rows.map((n) => (
            <button
              key={n.id}
              className={`activity-row ${n.readAt ? '' : 'unread-row'}`}
              onClick={() => open(n)}
            >
              <div className="activity-row-top">
                <strong>{n.actor?.displayName ?? 'Someone'}</strong>
                <span className="muted">
                  {n.type === 'dm' ? 'messaged you in' : 'mentioned you in'}{' '}
                  {channelName(n.channelId)}
                </span>
                <span className="muted activity-time">{timeFmt.format(new Date(n.createdAt))}</span>
              </div>
              {n.snippet && (
                <div className="activity-snippet">{stripMentionTokens(n.snippet, usersById)}</div>
              )}
            </button>
          ))}
          {activity.isLoading && <div className="muted pad-sm">Loading activity…</div>}
          {activity.isSuccess && rows.length === 0 && (
            <div className="muted pad-sm">
              Nothing yet — when someone mentions you or DMs you, it shows up here.
            </div>
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
