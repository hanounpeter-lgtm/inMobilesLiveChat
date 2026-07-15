import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChannelSummary, InvitePreview } from '@inmobiles/shared-types';
import { api, ApiError } from '../lib/api';
import { useChatStore } from '../lib/chat-store';

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api<InvitePreview>(`/invites/${token}`),
    retry: false,
  });

  const join = async () => {
    setJoining(true);
    setError(null);
    try {
      const channel = await api<ChannelSummary>(`/invites/${token}/accept`, { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['channels'] });
      setActiveChannel(channel.id);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join the channel');
      setJoining(false);
    }
  };

  const openExisting = () => {
    if (preview.data) setActiveChannel(preview.data.channelId);
    navigate('/', { replace: true });
  };

  if (preview.isLoading) {
    return <div className="fullscreen-center muted">Checking your invite…</div>;
  }

  if (preview.isError) {
    const err = preview.error;
    const msg =
      err instanceof ApiError && err.status === 410
        ? 'This invite link has expired.'
        : err instanceof ApiError && err.status === 404
          ? 'This invite link is invalid.'
          : 'Could not load this invite.';
    return (
      <div className="fullscreen-center">
        <div className="join-card">
          <h2>😕 {msg}</h2>
          <p className="muted">Ask a channel member for a fresh link.</p>
          <button className="btn-primary" onClick={() => navigate('/', { replace: true })}>
            Back to chat
          </button>
        </div>
      </div>
    );
  }

  const p = preview.data!;
  return (
    <div className="fullscreen-center">
      <div className="join-card">
        <div className="join-channel-name">
          {p.type === 'private' ? '🔒' : '#'} {p.name}
        </div>
        {p.topic && <p className="muted">{p.topic}</p>}
        <p className="muted">
          {p.memberCount} member{p.memberCount === 1 ? '' : 's'} · invited by {p.invitedBy}
        </p>
        {error && <div className="error-text">{error}</div>}
        {p.alreadyMember ? (
          <button className="btn-primary" onClick={openExisting}>
            You're already a member — open channel
          </button>
        ) : (
          <button className="btn-primary" onClick={() => void join()} disabled={joining}>
            {joining ? 'Joining…' : 'Join channel'}
          </button>
        )}
      </div>
    </div>
  );
}
