import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MessageDto } from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { useChatStore } from '../lib/chat-store';

/** Personal list of messages the user has saved (bookmarked). */
export default function SavedMessagesModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const { data, isLoading } = useQuery({
    queryKey: ['saved'],
    queryFn: () => api<{ messages: MessageDto[] }>('/me/saved'),
  });

  const unsave = async (m: MessageDto) => {
    await api(`/messages/${m.id}/save`, { method: 'DELETE' }).catch(() => undefined);
    void queryClient.invalidateQueries({ queryKey: ['saved'] });
  };

  const messages = data?.messages ?? [];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal directory-modal">
        <h3 className="modal-title">Saved messages</h3>
        <div className="directory-list">
          {isLoading && <div className="muted directory-empty">Loading…</div>}
          {!isLoading && messages.length === 0 && (
            <div className="muted directory-empty">
              No saved messages yet. Right-click a message → Save.
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className="saved-row">
              <button
                className="saved-jump"
                onClick={() => {
                  setActiveChannel(m.channelId);
                  onClose();
                }}
              >
                <span className="saved-author">{m.author.displayName}</span>
                <span className="saved-content">{m.content.slice(0, 160) || '(attachment)'}</span>
              </button>
              <button className="btn-secondary saved-remove" onClick={() => void unsave(m)}>
                Remove
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
