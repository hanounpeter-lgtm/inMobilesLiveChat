import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChannelSummary } from '@inmobiles/shared-types';
import { api } from '../lib/api';
import type { DirectoryUser } from '../lib/users';
import { useChatStore } from '../lib/chat-store';
import { useAuth } from '../lib/auth-store';

/** Company people directory — search by name, role, or department, and start a DM. */
export default function DirectoryModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const me = useAuth((s) => s.user);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const { data, isLoading } = useQuery({
    queryKey: ['directory', debounced],
    queryFn: () =>
      api<{ users: DirectoryUser[] }>(
        `/users${debounced ? `?q=${encodeURIComponent(debounced)}` : ''}`,
      ),
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
      onClose();
    },
  });

  const users = (data?.users ?? []).filter((u) => u.id !== me?.id);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal directory-modal">
        <h3 className="modal-title">Company directory</h3>
        <input
          className="directory-search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, job title, or department…"
        />
        <div className="directory-list">
          {isLoading && <div className="muted directory-empty">Loading…</div>}
          {!isLoading && users.length === 0 && (
            <div className="muted directory-empty">No people found</div>
          )}
          {users.map((u) => (
            <div key={u.id} className="directory-row">
              <span className={`presence-dot ${u.online ? 'online' : 'offline'}`} />
              {u.avatarUrl ? (
                <img className="avatar avatar-img" src={u.avatarUrl} alt="" />
              ) : (
                <span className="avatar avatar-letter">
                  {u.displayName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="directory-meta">
                <div className="directory-name">
                  {u.displayName}
                  {(u.role === 'owner' || u.role === 'admin') && (
                    <span className="role-badge">{u.role}</span>
                  )}
                </div>
                <div className="directory-sub muted">
                  {[u.jobTitle, u.department].filter(Boolean).join(' · ') || u.email}
                </div>
              </div>
              <button
                className="btn-secondary directory-dm"
                disabled={openDm.isPending}
                onClick={() => openDm.mutate(u.id)}
              >
                Message
              </button>
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
