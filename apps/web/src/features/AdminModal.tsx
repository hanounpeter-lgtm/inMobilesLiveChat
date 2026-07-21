import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminStatsDto, AdminUserDto } from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-store';

/** Admin dashboard — usage stats, a 7-day message chart, and user management. */
export default function AdminModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const me = useAuth((s) => s.user);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const { data: stats } = useQuery({ queryKey: ['admin-stats'], queryFn: () => api<AdminStatsDto>('/admin/stats') });
  const { data: usersData } = useQuery({ queryKey: ['admin-users'], queryFn: () => api<{ users: AdminUserDto[] }>('/admin/users') });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const setRole = async (u: AdminUserDto, role: 'admin' | 'member') => {
    await api(`/admin/users/${u.id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }).catch(() => undefined);
    void refresh();
  };
  const setActive = async (u: AdminUserDto, active: boolean) => {
    await api(`/admin/users/${u.id}/active`, { method: 'PATCH', body: JSON.stringify({ active }) }).catch(() => undefined);
    void refresh();
  };

  const maxA = Math.max(1, ...(stats?.activity ?? []).map((a) => a.messages));
  const users = usersData?.users ?? [];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal admin-modal">
        <h3 className="modal-title">Admin dashboard</h3>
        {stats && (
          <>
            <div className="admin-stats">
              <div className="stat-card"><span className="stat-num">{stats.totals.users}</span>Users</div>
              <div className="stat-card"><span className="stat-num">{stats.totals.channels}</span>Channels</div>
              <div className="stat-card"><span className="stat-num">{stats.totals.messages}</span>Messages</div>
              <div className="stat-card"><span className="stat-num">{stats.totals.calls}</span>Calls</div>
            </div>
            <div className="admin-chart">
              {stats.activity.map((a) => (
                <div key={a.date} className="chart-col" title={`${a.date}: ${a.messages}`}>
                  <div className="chart-bar" style={{ height: `${(a.messages / maxA) * 100}%` }} />
                  <span className="chart-label">{a.date.slice(5)}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <h4 className="admin-section-title">Users</h4>
        <div className="admin-users">
          {users.map((u) => (
            <div key={u.id} className={`admin-user${u.active ? '' : ' inactive'}`}>
              <div className="admin-user-meta">
                <span className="admin-user-name">
                  {u.displayName} <span className="role-badge">{u.role}</span>
                  {!u.active && <span className="muted"> · deactivated</span>}
                </span>
                <span className="muted admin-user-email">{u.email}</span>
              </div>
              {u.role !== 'owner' && u.id !== me?.id && (
                <div className="admin-user-actions">
                  {u.role === 'admin' ? (
                    <button className="btn-secondary" onClick={() => void setRole(u, 'member')}>
                      Demote
                    </button>
                  ) : (
                    <button className="btn-secondary" onClick={() => void setRole(u, 'admin')}>
                      Make admin
                    </button>
                  )}
                  {u.active ? (
                    <button className="btn-danger" onClick={() => void setActive(u, false)}>
                      Deactivate
                    </button>
                  ) : (
                    <button className="btn-secondary" onClick={() => void setActive(u, true)}>
                      Reactivate
                    </button>
                  )}
                </div>
              )}
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
