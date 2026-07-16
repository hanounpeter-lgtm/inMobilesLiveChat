import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChannelSummary } from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { useChatStore } from '../lib/chat-store';
import CreateChannelModal from './CreateChannelModal';
import InvitePeopleModal from './InvitePeopleModal';

interface DirectoryUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  online: boolean;
}

function dmTitle(channel: ChannelSummary): string {
  const names = channel.memberPreviews?.map((m) => m.displayName) ?? [];
  return names.join(', ') || 'Just you';
}

export default function Sidebar({ channels }: { channels: ChannelSummary[] }) {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const lastSeen = useChatStore((s) => s.lastSeenByChannel);
  const onlineUserIds = useChatStore((s) => s.onlineUserIds);
  const [showDmPicker, setShowDmPicker] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => api<{ users: DirectoryUser[] }>('/users'),
    enabled: showDmPicker,
  });

  const openDm = useMutation({
    mutationFn: (memberId: string) =>
      api<ChannelSummary>('/channels/dm', {
        method: 'POST',
        body: JSON.stringify({ memberIds: [memberId] }),
      }),
    onSuccess: (channel) => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      setActiveChannel(channel.id);
      setShowDmPicker(false);
    },
  });

  const isUnread = (c: ChannelSummary) => {
    if (!c.lastMessageAt || c.id === activeChannelId) return false;
    if (c.notifyLevel === 'none') return false; // muted channels never bold
    const seen = lastSeen[c.id];
    return !seen || new Date(c.lastMessageAt) > new Date(seen);
  };

  const live = channels.filter((c) => !c.isArchived);
  const starred = live.filter((c) => c.isStarred);
  const regular = live.filter(
    (c) => !c.isStarred && (c.type === 'public' || c.type === 'private'),
  );
  const dms = live.filter((c) => !c.isStarred && (c.type === 'dm' || c.type === 'group_dm'));
  const archived = channels.filter((c) => c.isArchived);

  const channelButton = (c: ChannelSummary) => {
    const isDm = c.type === 'dm' || c.type === 'group_dm';
    const other = isDm ? c.memberPreviews?.[0] : undefined;
    const online = other ? onlineUserIds.has(other.id) : false;
    return (
      <button
        key={c.id}
        className={`channel-item ${c.id === activeChannelId ? 'active' : ''} ${isUnread(c) ? 'unread' : ''} ${c.notifyLevel === 'none' ? 'muted-channel' : ''}`}
        onClick={() => setActiveChannel(c.id)}
      >
        {isDm ? (
          <span className={`presence-dot ${online ? 'online' : ''}`} />
        ) : (
          <span className="channel-hash">{c.type === 'private' ? '🔒' : '#'}</span>
        )}
        {isDm ? dmTitle(c) : c.name}
      </button>
    );
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="workspace-brand">
          <img src="/logo.svg" alt="" className="logo-mark small" />
          <span className="workspace-name">inMobiles</span>
        </span>
        {isAdmin && (
          <button
            className="icon-btn"
            title="Invite people to the workspace"
            onClick={() => setShowInvite(true)}
          >
            ✉+
          </button>
        )}
      </div>

      <div className="sidebar-scroll">
        {starred.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">
              <span>★ Starred</span>
            </div>
            {starred.map(channelButton)}
          </div>
        )}

        <div className="sidebar-section">
          <div className="sidebar-section-title">
            <span>Channels</span>
            <button className="icon-btn" title="Create channel" onClick={() => setShowCreate(true)}>
              +
            </button>
          </div>
          {regular.map(channelButton)}
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-title">
            <span>Direct messages</span>
            <button className="icon-btn" title="New DM" onClick={() => setShowDmPicker((v) => !v)}>
              +
            </button>
          </div>
          {showDmPicker && (
            <div className="dm-picker">
              {(usersQuery.data?.users ?? [])
                .filter((u) => u.id !== user?.id)
                .map((u) => (
                  <button key={u.id} className="channel-item" onClick={() => openDm.mutate(u.id)}>
                    <span className={`presence-dot ${u.online ? 'online' : ''}`} />
                    {u.displayName}
                  </button>
                ))}
              {usersQuery.isLoading && <div className="muted pad-sm">Loading people…</div>}
            </div>
          )}
          {dms.map(channelButton)}
        </div>

        {archived.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">
              <button className="archived-toggle" onClick={() => setShowArchived((v) => !v)}>
                {showArchived ? '▾' : '▸'} Archived · {archived.length}
              </button>
            </div>
            {showArchived && archived.map(channelButton)}
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <div className="me">
          <span className="presence-dot online" />
          <span className="me-name">{user?.displayName}</span>
        </div>
        <button className="icon-btn" title="Sign out" onClick={() => void logout()}>
          ⎋
        </button>
      </div>

      {showCreate && <CreateChannelModal onClose={() => setShowCreate(false)} />}
      {showInvite && <InvitePeopleModal onClose={() => setShowInvite(false)} />}
    </aside>
  );
}
