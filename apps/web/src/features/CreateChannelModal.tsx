import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChannelSummary } from '@inmobiles/shared-types';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { useChatStore } from '../lib/chat-store';

interface DirectoryUser {
  id: string;
  displayName: string;
  online: boolean;
}

const slugify = (raw: string) =>
  raw
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .slice(0, 64);

export default function CreateChannelModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);

  const [name, setName] = useState('');
  const [type, setType] = useState<'public' | 'private'>('public');
  const [topic, setTopic] = useState('');
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [memberFilter, setMemberFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => api<{ users: DirectoryUser[] }>('/users'),
  });
  const people = useMemo(
    () =>
      (usersQuery.data?.users ?? [])
        .filter((u) => u.id !== user?.id)
        .filter((u) => u.displayName.toLowerCase().includes(memberFilter.toLowerCase())),
    [usersQuery.data, user?.id, memberFilter],
  );

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const slug = slugify(name);

  const create = useMutation({
    mutationFn: () =>
      api<ChannelSummary>('/channels', {
        method: 'POST',
        body: JSON.stringify({
          name: slug,
          type,
          topic: topic.trim() || undefined,
          memberIds: [...memberIds],
        }),
      }),
    onSuccess: (channel) => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      setActiveChannel(channel.id);
      onClose();
    },
    onError: (err) => {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'A channel with that name already exists'
          : err instanceof Error
            ? err.message
            : 'Could not create channel',
      );
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!slug) {
      setError('Channel name is required');
      return;
    }
    create.mutate();
  };

  const toggleMember = (id: string) =>
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={onSubmit}>
        <h3 className="modal-title">Create a channel</h3>

        <label className="field">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. design team"
            autoFocus
            maxLength={64}
          />
          {slug && <span className="muted slug-preview"># {slug}</span>}
          {error && <span className="error-text">{error}</span>}
        </label>

        <div className="field">
          Visibility
          <div className="segmented">
            <button
              type="button"
              className={type === 'public' ? 'active' : ''}
              onClick={() => setType('public')}
            >
              # Public
            </button>
            <button
              type="button"
              className={type === 'private' ? 'active' : ''}
              onClick={() => setType('private')}
            >
              🔒 Private
            </button>
          </div>
          <span className="muted hint">
            {type === 'public'
              ? 'Anyone in the workspace can browse and join.'
              : 'Only invited people can see or join this channel.'}
          </span>
        </div>

        <label className="field">
          Topic <span className="muted">(optional)</span>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What is this channel about?"
            maxLength={250}
          />
        </label>

        <div className="field">
          Add members <span className="muted">(optional)</span>
          <input
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
            placeholder="Search people…"
          />
          <div className="member-picklist">
            {people.map((u) => (
              <label key={u.id} className="member-pick">
                <input
                  type="checkbox"
                  checked={memberIds.has(u.id)}
                  onChange={() => toggleMember(u.id)}
                />
                <span className={`presence-dot ${u.online ? 'online' : ''}`} />
                {u.displayName}
              </label>
            ))}
            {people.length === 0 && <div className="muted pad-sm">No people found</div>}
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!slug || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create channel'}
          </button>
        </div>
      </form>
    </div>
  );
}
