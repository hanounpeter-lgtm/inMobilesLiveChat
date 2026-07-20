import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkspaceInviteDto } from '@inmobiles/shared-types';
import { api } from '../lib/api';

export default function InvitePeopleModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const pending = useQuery({
    queryKey: ['workspace-invites'],
    queryFn: () => api<{ invites: WorkspaceInviteDto[] }>('/workspace/invites'),
  });

  const create = useMutation({
    mutationFn: (list: string[]) =>
      api<{ invites: WorkspaceInviteDto[]; skipped: string[]; invalid: string[] }>(
        '/workspace/invites',
        {
          method: 'POST',
          body: JSON.stringify({ emails: list, role }),
        },
      ),
    onSuccess: (res) => {
      setEmails('');
      setError(null);
      const parts = [];
      if (res.invites.length > 0) parts.push(`${res.invites.length} invite(s) sent`);
      if (res.skipped.length > 0) parts.push(`already have accounts: ${res.skipped.join(', ')}`);
      if ((res.invalid?.length ?? 0) > 0)
        parts.push(`not @inmobiles.com, skipped: ${res.invalid.join(', ')}`);
      setNotice(parts.join(' · '));
      void queryClient.invalidateQueries({ queryKey: ['workspace-invites'] });
    },
    onError: (err) => {
      setNotice(null);
      setError(err instanceof Error ? err.message : 'Could not create invites');
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api(`/workspace/invites/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['workspace-invites'] }),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const list = emails
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0) return;
    create.mutate(list);
  };

  const copyLink = async (invite: WorkspaceInviteDto) => {
    const url = `${window.location.origin}/signup/${invite.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(invite.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      window.prompt('Copy this invite link:', url);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3 className="modal-title">Invite people to inChat</h3>
        <form onSubmit={onSubmit} className="field">
          Email addresses <span className="muted">(comma or space separated)</span>
          <textarea
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="maria@inmobiles.com, joe@inmobiles.com"
            rows={2}
            autoFocus
          />
          <div className="segmented">
            <button
              type="button"
              className={role === 'member' ? 'active' : ''}
              onClick={() => setRole('member')}
            >
              Member
            </button>
            <button
              type="button"
              className={role === 'admin' ? 'active' : ''}
              onClick={() => setRole('admin')}
            >
              Admin
            </button>
          </div>
          {error && <span className="error-text">{error}</span>}
          {notice && <span className="muted hint">{notice}</span>}
          <button type="submit" className="btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Sending…' : 'Send invites'}
          </button>
          <span className="muted hint">
            Each person gets an email with a signup link (also copyable below). Links expire in 7
            days.
          </span>
        </form>

        {(pending.data?.invites.length ?? 0) > 0 && (
          <div className="field">
            Pending invites
            <div className="member-list">
              {pending.data!.invites.map((invite) => (
                <div key={invite.id} className="member-row">
                  <span className="member-name">
                    {invite.email} <span className="badge">{invite.role}</span>
                  </span>
                  <button className="icon-btn" onClick={() => void copyLink(invite)}>
                    {copiedId === invite.id ? '✓' : '🔗'}
                  </button>
                  <button
                    className="icon-btn danger"
                    title="Revoke"
                    onClick={() => revoke.mutate(invite.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
