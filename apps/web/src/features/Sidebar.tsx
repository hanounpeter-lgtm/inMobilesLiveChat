import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChannelSummary } from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { useChatStore } from '../lib/chat-store';
import CreateChannelModal from './CreateChannelModal';
import InvitePeopleModal from './InvitePeopleModal';
import ActivityModal from './ActivityModal';
import SearchModal from './SearchModal';
import ProfileModal from './ProfileModal';
import DirectoryModal from './DirectoryModal';
import SavedMessagesModal from './SavedMessagesModal';
import InvitesModal, { invitationsKey } from './InvitesModal';
import TasksModal from './TasksModal';
import FilesHubModal from './FilesHubModal';
import CalendarModal from './CalendarModal';
import AdminModal from './AdminModal';
import BroadcastModal from './BroadcastModal';
import type { JoinCallResponse, MeetingDto } from '@inmobiles/shared-types';
import { TimeclockWidget } from './Timeclock';
import { useUnreads } from '../lib/unreads';
import {
  IconAt,
  IconCalendar,
  IconChart,
  IconFile,
  IconLock,
  IconLogOut,
  IconPlus,
  IconSearch,
  IconStar,
  IconUserPlus,
  IconUsers,
} from '../components/icons';

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
  const onlineUserIds = useChatStore((s) => s.onlineUserIds);
  const { unreads } = useUnreads();
  const [showDmPicker, setShowDmPicker] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showDirectory, setShowDirectory] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [showInvites, setShowInvites] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const openHome = useChatStore((s) => s.openHome);
  const setCurrentCall = useChatStore((s) => s.setCurrentCall);

  const joinByCode = async () => {
    const code = window.prompt('Enter meeting code:')?.trim();
    if (!code) return;
    try {
      const meeting = await api<MeetingDto>(`/meetings/by-code/${encodeURIComponent(code)}`);
      setActiveChannel(meeting.channelId);
      const join = await api<JoinCallResponse>(`/channels/${meeting.channelId}/call`, {
        method: 'POST',
        body: JSON.stringify({ type: meeting.type }),
      });
      setCurrentCall(join);
    } catch {
      window.alert('No meeting found for that code.');
    }
  };

  const focusMode = async () => {
    const raw = window.prompt('Focus for how many minutes?', '30');
    const mins = Number(raw);
    if (!mins || mins <= 0) return;
    const until = new Date(Date.now() + mins * 60_000);
    const label = `🎯 Focusing until ${until.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
    const updated = await api<{ statusText: string | null }>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ statusText: label }),
    }).catch(() => null);
    if (updated) useAuth.setState((s) => ({ user: s.user ? { ...s.user, statusText: label } : s.user }));
  };

  // Ctrl/Cmd+K opens search from anywhere.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowSearch((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';
  const totalMentions = Object.values(unreads).reduce((sum, u) => sum + u.mentionCount, 0);

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => api<{ users: DirectoryUser[] }>('/users'),
    enabled: showDmPicker,
  });

  const invitesQuery = useQuery({
    queryKey: invitationsKey,
    queryFn: () => api<{ invitations: { id: string }[] }>('/me/invitations'),
  });
  const pendingInvites = invitesQuery.data?.invitations.length ?? 0;

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

  // Bold per notify level; the numeric badge (mentions/DMs) always shows.
  const isUnread = (c: ChannelSummary) => {
    if (c.id === activeChannelId) return false;
    const u = unreads[c.id];
    if (!u) return false;
    if (c.notifyLevel === 'none') return false;
    if (c.notifyLevel === 'mentions') return u.mentionCount > 0;
    return u.hasUnread || u.mentionCount > 0;
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
          <span className="channel-hash">
            {c.type === 'private' ? <IconLock size={13} /> : '#'}
          </span>
        )}
        <span className="channel-label">{isDm ? dmTitle(c) : c.name}</span>
        {(unreads[c.id]?.mentionCount ?? 0) > 0 && (
          <span className="unread-badge">{unreads[c.id]!.mentionCount}</span>
        )}
      </button>
    );
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="workspace-brand">
          <img src="/logo.svg" alt="" className="logo-mark small" />
          <span className="workspace-name">inChat</span>
        </span>
        {isAdmin && (
          <button
            className="icon-btn"
            title="Invite people to the workspace"
            onClick={() => setShowInvite(true)}
          >
            <IconUserPlus size={16} />
          </button>
        )}
      </div>

      <div className="sidebar-scroll">
        <div className="sidebar-section">
          <button className="channel-item" onClick={openHome}>
            <span className="channel-hash">🏠</span>
            <span className="channel-label">Home</span>
          </button>
          <button className="channel-item" onClick={() => setShowSearch(true)}>
            <span className="channel-hash">
              <IconSearch size={14} />
            </span>
            <span className="channel-label">Search</span>
            <span className="muted kbd-hint">Ctrl K</span>
          </button>
          <button className="channel-item" onClick={() => setShowActivity(true)}>
            <span className="channel-hash">
              <IconAt size={14} />
            </span>
            <span className="channel-label">Activity</span>
            {totalMentions > 0 && <span className="unread-badge">{totalMentions}</span>}
          </button>
          <button className="channel-item" onClick={() => setShowDirectory(true)}>
            <span className="channel-hash">
              <IconUsers size={14} />
            </span>
            <span className="channel-label">Directory</span>
          </button>
          <button className="channel-item" onClick={() => setShowSaved(true)}>
            <span className="channel-hash">
              <IconStar size={14} />
            </span>
            <span className="channel-label">Saved</span>
          </button>
          <button className="channel-item" onClick={() => setShowInvites(true)}>
            <span className="channel-hash">
              <IconUserPlus size={14} />
            </span>
            <span className="channel-label">Invites</span>
            {pendingInvites > 0 && <span className="unread-badge">{pendingInvites}</span>}
          </button>
          <button className="channel-item" onClick={() => setShowTasks(true)}>
            <span className="channel-hash">✓</span>
            <span className="channel-label">Tasks</span>
          </button>
          <button className="channel-item" onClick={() => setShowCalendar(true)}>
            <span className="channel-hash">
              <IconCalendar size={14} />
            </span>
            <span className="channel-label">Calendar</span>
          </button>
          <button className="channel-item" onClick={() => setShowFiles(true)}>
            <span className="channel-hash">
              <IconFile size={14} />
            </span>
            <span className="channel-label">Files</span>
          </button>
          <button className="channel-item" onClick={() => setShowBroadcast(true)}>
            <span className="channel-hash">📣</span>
            <span className="channel-label">Broadcast</span>
          </button>
          <button className="channel-item" onClick={() => void joinByCode()}>
            <span className="channel-hash">#️⃣</span>
            <span className="channel-label">Join by code</span>
          </button>
          <button className="channel-item" onClick={() => void focusMode()}>
            <span className="channel-hash">🎯</span>
            <span className="channel-label">Focus mode</span>
          </button>
          {isAdmin && (
            <button className="channel-item" onClick={() => setShowAdmin(true)}>
              <span className="channel-hash">
                <IconChart size={14} />
              </span>
              <span className="channel-label">Admin</span>
            </button>
          )}
        </div>
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
              <IconPlus size={14} />
            </button>
          </div>
          {regular.map(channelButton)}
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-title">
            <span>Direct messages</span>
            <button className="icon-btn" title="New DM" onClick={() => setShowDmPicker((v) => !v)}>
              <IconPlus size={14} />
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

      <TimeclockWidget />
      <div className="sidebar-footer">
        <button className="me" title="Edit your profile" onClick={() => setShowProfile(true)}>
          {user?.avatarUrl ? (
            <img className="me-avatar" src={user.avatarUrl} alt="" />
          ) : (
            <span className="presence-dot online" />
          )}
          <span className="me-name">{user?.displayName}</span>
        </button>
        <button className="icon-btn" title="Sign out" onClick={() => void logout()}>
          <IconLogOut size={15} />
        </button>
      </div>

      {showCreate && <CreateChannelModal onClose={() => setShowCreate(false)} />}
      {showInvite && <InvitePeopleModal onClose={() => setShowInvite(false)} />}
      {showActivity && <ActivityModal onClose={() => setShowActivity(false)} />}
      {showSearch && <SearchModal onClose={() => setShowSearch(false)} />}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      {showDirectory && <DirectoryModal onClose={() => setShowDirectory(false)} />}
      {showSaved && <SavedMessagesModal onClose={() => setShowSaved(false)} />}
      {showInvites && <InvitesModal onClose={() => setShowInvites(false)} />}
      {showTasks && <TasksModal onClose={() => setShowTasks(false)} />}
      {showCalendar && <CalendarModal onClose={() => setShowCalendar(false)} />}
      {showFiles && <FilesHubModal onClose={() => setShowFiles(false)} />}
      {showAdmin && <AdminModal onClose={() => setShowAdmin(false)} />}
      {showBroadcast && <BroadcastModal onClose={() => setShowBroadcast(false)} />}
    </aside>
  );
}
