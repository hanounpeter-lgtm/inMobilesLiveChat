import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChannelMemberDto,
  ChannelSummary,
  InviteLinkResponse,
  MyChannelSettingsRequest,
  NotifyLevel,
  UpdateChannelRequest,
} from '@inmobiles/shared-types';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { useChatStore } from '../lib/chat-store';
import { canManageChannel } from '../lib/permissions';

type Tab = 'about' | 'members' | 'settings';

const membersKey = (channelId: string) => ['channel-members', channelId] as const;

export default function ChannelDetailsPanel({ channel }: { channel: ChannelSummary }) {
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const closePanel = useChatStore((s) => s.setDetailsPanel);
  const onlineUserIds = useChatStore((s) => s.onlineUserIds);
  const [tab, setTab] = useState<Tab>('about');

  const isDm = channel.type === 'dm' || channel.type === 'group_dm';
  const canManage = !isDm && canManageChannel(channel, user);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel(false);
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [closePanel]);

  // Settings tab isn't available on DMs; fall back if the channel switches.
  useEffect(() => {
    if ((isDm || !canManage) && tab === 'settings') setTab('about');
  }, [isDm, canManage, tab]);

  const mySettings = useMutation({
    mutationFn: (dto: MyChannelSettingsRequest) =>
      api<ChannelSummary>(`/channels/${channel.id}/my-settings`, {
        method: 'PATCH',
        body: JSON.stringify(dto),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData<{ channels: ChannelSummary[] }>(['channels'], (data) =>
        data
          ? { channels: data.channels.map((c) => (c.id === updated.id ? updated : c)) }
          : data,
      );
    },
  });

  return (
    <aside className="details-panel">
      <div className="details-header">
        <h3>{isDm ? 'Conversation details' : `# ${channel.name}`}</h3>
        <button className="icon-btn" title="Close" onClick={() => closePanel(false)}>
          ✕
        </button>
      </div>

      <div className="tabs">
        <button className={tab === 'about' ? 'active' : ''} onClick={() => setTab('about')}>
          About
        </button>
        <button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>
          Members · {channel.memberCount}
        </button>
        {canManage && (
          <button
            className={tab === 'settings' ? 'active' : ''}
            onClick={() => setTab('settings')}
          >
            Settings
          </button>
        )}
      </div>

      <div className="details-body">
        {tab === 'about' && (
          <AboutTab channel={channel} isDm={isDm} onMySettings={(dto) => mySettings.mutate(dto)} />
        )}
        {tab === 'members' && (
          <MembersTab
            channel={channel}
            canManage={canManage}
            selfId={user?.id ?? ''}
            onlineUserIds={onlineUserIds}
          />
        )}
        {tab === 'settings' && canManage && <SettingsTab channel={channel} />}
      </div>
    </aside>
  );
}

// ---------- About ----------

function AboutTab({
  channel,
  isDm,
  onMySettings,
}: {
  channel: ChannelSummary;
  isDm: boolean;
  onMySettings: (dto: MyChannelSettingsRequest) => void;
}) {
  const levels: { value: NotifyLevel; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'mentions', label: 'Mentions' },
    { value: 'none', label: 'Mute' },
  ];

  return (
    <div className="tab-content">
      <div className="pref-block">
        <div className="pref-row">
          <span>Notifications</span>
          <div className="segmented small">
            {levels.map((l) => (
              <button
                key={l.value}
                className={channel.notifyLevel === l.value ? 'active' : ''}
                onClick={() => onMySettings({ notifyLevel: l.value })}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <div className="pref-row">
          <span>Star channel</span>
          <button
            className={`star-toggle ${channel.isStarred ? 'starred' : ''}`}
            title={channel.isStarred ? 'Unstar' : 'Star'}
            onClick={() => onMySettings({ isStarred: !channel.isStarred })}
          >
            {channel.isStarred ? '★ Starred' : '☆ Star'}
          </button>
        </div>
      </div>

      {!isDm && (
        <>
          <dl className="about-list">
            <dt>Topic</dt>
            <dd>{channel.topic || <span className="muted">No topic set</span>}</dd>
            <dt>Description</dt>
            <dd>{channel.description || <span className="muted">No description</span>}</dd>
            <dt>Visibility</dt>
            <dd>{channel.type === 'private' ? '🔒 Private' : '# Public'}</dd>
            <dt>Posting</dt>
            <dd>{channel.postingPolicy === 'admins_only' ? 'Admins only' : 'Everyone'}</dd>
          </dl>
          {channel.isArchived && <div className="archived-note muted">This channel is archived.</div>}
        </>
      )}
    </div>
  );
}

// ---------- Members ----------

function MembersTab({
  channel,
  canManage,
  selfId,
  onlineUserIds,
}: {
  channel: ChannelSummary;
  canManage: boolean;
  selfId: string;
  onlineUserIds: Set<string>;
}) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState('');

  const membersQuery = useQuery({
    queryKey: membersKey(channel.id),
    queryFn: () => api<{ members: ChannelMemberDto[] }>(`/channels/${channel.id}/members`),
  });
  const members = membersQuery.data?.members ?? [];

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => api<{ users: { id: string; displayName: string; online: boolean }[] }>('/users'),
    enabled: showAdd,
  });
  const candidates = useMemo(() => {
    const memberSet = new Set(members.map((m) => m.id));
    return (usersQuery.data?.users ?? [])
      .filter((u) => !memberSet.has(u.id))
      .filter((u) => u.displayName.toLowerCase().includes(filter.toLowerCase()));
  }, [usersQuery.data, members, filter]);

  const addMember = useMutation({
    mutationFn: (userId: string) =>
      api(`/channels/${channel.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ userIds: [userId] }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membersKey(channel.id) });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) =>
      api(`/channels/${channel.id}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membersKey(channel.id) });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });

  const isDm = channel.type === 'dm' || channel.type === 'group_dm';
  const canLeave = !isDm && !channel.isDefault;

  return (
    <div className="tab-content">
      {!isDm && !channel.isArchived && (
        <>
          <button className="btn-secondary full-width" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? 'Done' : '+ Add people'}
          </button>
          <CopyInviteLink channelId={channel.id} />
        </>
      )}
      {showAdd && (
        <div className="add-people">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search people…"
          />
          {candidates.map((u) => (
            <button key={u.id} className="channel-item" onClick={() => addMember.mutate(u.id)}>
              <span className={`presence-dot ${u.online ? 'online' : ''}`} />
              {u.displayName}
              <span className="muted add-hint">Add</span>
            </button>
          ))}
          {candidates.length === 0 && <div className="muted pad-sm">Everyone is already here</div>}
        </div>
      )}

      <div className="member-list">
        {members.map((m) => (
          <div key={m.id} className="member-row">
            <span className={`presence-dot ${onlineUserIds.has(m.id) ? 'online' : ''}`} />
            <span className="member-name">
              {m.displayName}
              {m.id === selfId && <span className="muted"> (you)</span>}
            </span>
            {m.id === channel.createdById && <span className="badge">creator</span>}
            {(m.workspaceRole === 'owner' || m.workspaceRole === 'admin') && (
              <span className="badge">{m.workspaceRole}</span>
            )}
            {canManage && m.id !== selfId && !channel.isDefault && (
              <button
                className="icon-btn danger"
                title={`Remove ${m.displayName}`}
                onClick={() => removeMember.mutate(m.id)}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {membersQuery.isLoading && <div className="muted pad-sm">Loading members…</div>}
      </div>

      {canLeave && (
        <button
          className="btn-danger full-width"
          onClick={() => {
            if (window.confirm(`Leave #${channel.name}?`)) removeMember.mutate(selfId);
          }}
        >
          Leave channel
        </button>
      )}
    </div>
  );
}

// ---------- Invite link ----------

function CopyInviteLink({ channelId }: { channelId: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [lastUrl, setLastUrl] = useState<string | null>(null);

  const copy = async () => {
    try {
      const invite = await api<InviteLinkResponse>(`/channels/${channelId}/invite-link`, {
        method: 'POST',
      });
      const url = `${window.location.origin}/join/${invite.token}`;
      setLastUrl(url);
      await navigator.clipboard.writeText(url);
      setState('copied');
    } catch {
      // Clipboard can be blocked; the visible URL below is the fallback.
      setState((s) => (s === 'idle' ? 'error' : s));
    } finally {
      setTimeout(() => setState('idle'), 2500);
    }
  };

  return (
    <div className="invite-link-block">
      <button className="btn-secondary full-width" onClick={() => void copy()}>
        {state === 'copied' ? '✓ Link copied' : '🔗 Copy invite link'}
      </button>
      {(state === 'error' || state === 'copied') && lastUrl && (
        <input className="invite-url" readOnly value={lastUrl} onFocus={(e) => e.target.select()} />
      )}
      <span className="muted hint">Anyone in the workspace with the link can join. Expires in 7 days.</span>
    </div>
  );
}

// ---------- Settings (managers only) ----------

function SettingsTab({ channel }: { channel: ChannelSummary }) {
  const [name, setName] = useState(channel.name ?? '');
  const [topic, setTopic] = useState(channel.topic ?? '');
  const [description, setDescription] = useState(channel.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(channel.name ?? '');
    setTopic(channel.topic ?? '');
    setDescription(channel.description ?? '');
  }, [channel.id, channel.name, channel.topic, channel.description]);

  const update = useMutation({
    mutationFn: (dto: UpdateChannelRequest) =>
      api<ChannelSummary>(`/channels/${channel.id}`, {
        method: 'PATCH',
        body: JSON.stringify(dto),
      }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      // Cache updates arrive via the ChannelUpdated socket echo.
    },
    onError: (err) => {
      setSaved(false);
      setError(
        err instanceof ApiError && err.status === 409
          ? 'A channel with that name already exists'
          : err instanceof Error
            ? err.message
            : 'Update failed',
      );
    },
  });

  const saveBasics = () => {
    const dto: UpdateChannelRequest = {};
    const slug = name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_]/g, '');
    if (slug && slug !== channel.name) dto.name = slug;
    if (topic.trim() !== (channel.topic ?? '')) dto.topic = topic.trim() || null;
    if (description.trim() !== (channel.description ?? ''))
      dto.description = description.trim() || null;
    if (Object.keys(dto).length > 0) update.mutate(dto);
  };

  const convertVisibility = () => {
    const toPublic = channel.type === 'private';
    const warning = toPublic
      ? `Make #${channel.name} public?\n\nMessage history will become visible to everyone who joins.`
      : `Make #${channel.name} private?\n\nCurrent members are kept; it disappears from the channel browser.`;
    if (window.confirm(warning)) update.mutate({ type: toPublic ? 'public' : 'private' });
  };

  return (
    <div className="tab-content">
      <label className="field">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} />
      </label>
      <label className="field">
        Topic
        <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={250} />
      </label>
      <label className="field">
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={3}
        />
      </label>
      {error && <div className="error-text">{error}</div>}
      <button className="btn-primary full-width" onClick={saveBasics} disabled={update.isPending}>
        {saved ? 'Saved ✓' : 'Save changes'}
      </button>

      <div className="field">
        Who can post
        <div className="segmented">
          <button
            className={channel.postingPolicy === 'everyone' ? 'active' : ''}
            onClick={() => update.mutate({ postingPolicy: 'everyone' })}
          >
            Everyone
          </button>
          <button
            className={channel.postingPolicy === 'admins_only' ? 'active' : ''}
            onClick={() => update.mutate({ postingPolicy: 'admins_only' })}
          >
            Admins only
          </button>
        </div>
      </div>

      {!channel.isDefault && (
        <div className="danger-zone">
          <div className="danger-zone-title">Danger zone</div>
          <button className="btn-secondary full-width" onClick={convertVisibility}>
            {channel.type === 'private' ? 'Convert to public channel' : 'Convert to private channel'}
          </button>
          <button
            className="btn-danger full-width"
            onClick={() => {
              if (channel.isArchived) {
                update.mutate({ isArchived: false });
              } else if (
                window.confirm(
                  `Archive #${channel.name}? It becomes read-only and moves to the Archived section.`,
                )
              ) {
                update.mutate({ isArchived: true });
              }
            }}
          >
            {channel.isArchived ? 'Unarchive channel' : 'Archive channel'}
          </button>
        </div>
      )}
    </div>
  );
}
