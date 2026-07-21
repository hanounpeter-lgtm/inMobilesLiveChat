import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TaskDto } from '@inmobiles/shared-types';
import { api } from '../lib/api';

/** Personal to-do list — tasks you created (personal) or are assigned to you. */
export default function TasksModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const { data } = useQuery({ queryKey: ['my-tasks'], queryFn: () => api<{ tasks: TaskDto[] }>('/me/tasks') });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['my-tasks'] });

  const add = async () => {
    if (!title.trim()) return;
    await api('/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: title.trim(), dueAt: due ? new Date(due).toISOString() : null }),
    }).catch(() => undefined);
    setTitle('');
    setDue('');
    void refresh();
  };
  const toggle = async (t: TaskDto) => {
    await api(`/tasks/${t.id}`, { method: 'PATCH', body: JSON.stringify({ done: !t.done }) }).catch(() => undefined);
    void refresh();
  };
  const remove = async (t: TaskDto) => {
    await api(`/tasks/${t.id}`, { method: 'DELETE' }).catch(() => undefined);
    void refresh();
  };

  const tasks = data?.tasks ?? [];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal directory-modal">
        <h3 className="modal-title">My tasks</h3>
        <div className="task-add">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a task…"
            onKeyDown={(e) => e.key === 'Enter' && void add()}
          />
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} title="Due date" />
          <button className="btn-primary" onClick={() => void add()}>
            Add
          </button>
        </div>
        <div className="directory-list">
          {tasks.length === 0 && <div className="muted directory-empty">No tasks yet</div>}
          {tasks.map((t) => (
            <div key={t.id} className={`task-row${t.done ? ' done' : ''}`}>
              <input type="checkbox" checked={t.done} onChange={() => void toggle(t)} />
              <div className="task-meta">
                <span className="task-title">{t.title}</span>
                <span className="task-sub muted">
                  {t.channelId ? 'channel task' : 'personal'}
                  {t.dueAt ? ` · due ${new Date(t.dueAt).toLocaleString()}` : ''}
                  {t.assignee ? ` · ${t.assignee.displayName}` : ''}
                </span>
              </div>
              <button className="task-del" onClick={() => void remove(t)} title="Delete">
                ✕
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
