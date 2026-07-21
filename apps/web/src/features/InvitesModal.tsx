import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChannelInvitationDto, ChannelSummary } from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { useChatStore } from '../lib/chat-store';
import { IconLock } from '../components/icons';

export const invitationsKey = ['invitations'] as const;

/** Inbox of pending channel invitations — accept to join, decline to dismiss. */
export default function InvitesModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const { data, isLoading } = useQuery({
    queryKey: invitationsKey,
    queryFn: () => api<{ invitations: ChannelInvitationDto[] }>('/me/invitations'),
  });

  const accept = async (inv: ChannelInvitationDto) => {
    const channel = await api<ChannelSummary>(`/invitations/${inv.id}/accept`, { method: 'POST' });
    await queryClient.invalidateQueries({ queryKey: invitationsKey });
    void queryClient.invalidateQueries({ queryKey: ['channels'] });
    setActiveChannel(channel.id);
    onClose();
  };

  const decline = async (inv: ChannelInvitationDto) => {
    await api(`/invitations/${inv.id}/decline`, { method: 'POST' }).catch(() => undefined);
    void queryClient.invalidateQueries({ queryKey: invitationsKey });
  };

  const invitations = data?.invitations ?? [];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal directory-modal">
        <h3 className="modal-title">Channel invites</h3>
        <div className="directory-list">
          {isLoading && <div className="muted directory-empty">Loading…</div>}
          {!isLoading && invitations.length === 0 && (
            <div className="muted directory-empty">No pending invites</div>
          )}
          {invitations.map((inv) => (
            <div key={inv.id} className="invite-row">
              <div className="invite-meta">
                <div className="invite-channel">
                  {inv.channel.type === 'private' ? <IconLock size={13} /> : <span className="channel-hash">#</span>}
                  {inv.channel.name ?? 'channel'}
                </div>
                <div className="invite-sub muted">
                  {inv.inviter.displayName} invited you · {inv.channel.memberCount} member
                  {inv.channel.memberCount === 1 ? '' : 's'}
                </div>
              </div>
              <div className="invite-actions">
                <button className="btn-secondary" onClick={() => void decline(inv)}>
                  Decline
                </button>
                <button className="btn-primary" onClick={() => void accept(inv)}>
                  Accept
                </button>
              </div>
            </div>
          ))}
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
