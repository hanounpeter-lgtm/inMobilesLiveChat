import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FileHubItemDto, FileUrlResponse } from '@inmobiles/shared-types';
import { api } from '../lib/api';

const TYPES = [
  { key: '', label: 'All' },
  { key: 'image', label: 'Images' },
  { key: 'video', label: 'Video' },
  { key: 'audio', label: 'Audio' },
  { key: 'pdf', label: 'PDF' },
];

function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** All files shared across the user's channels, with search + type filters. */
export default function FilesHubModal({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
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
    queryKey: ['files-hub', debounced, type],
    queryFn: () =>
      api<{ files: FileHubItemDto[] }>(
        `/files/hub?${new URLSearchParams({ ...(debounced ? { q: debounced } : {}), ...(type ? { type } : {}) })}`,
      ),
  });

  const download = async (f: FileHubItemDto) => {
    const res = await api<FileUrlResponse>(`/files/${f.id}/url`).catch(() => null);
    if (res) window.open(res.url, '_blank');
  };

  const files = data?.files ?? [];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal directory-modal">
        <h3 className="modal-title">Files</h3>
        <input
          className="directory-search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search files…"
        />
        <div className="file-filters">
          {TYPES.map((t) => (
            <button
              key={t.key}
              className={`file-filter${type === t.key ? ' active' : ''}`}
              onClick={() => setType(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="directory-list">
          {isLoading && <div className="muted directory-empty">Loading…</div>}
          {!isLoading && files.length === 0 && <div className="muted directory-empty">No files</div>}
          {files.map((f) => (
            <button key={f.id} className="file-row" onClick={() => void download(f)}>
              <span className="file-icon">{f.isImage ? '🖼️' : f.mimeType === 'application/pdf' ? '📄' : '📎'}</span>
              <div className="file-meta">
                <span className="file-name">{f.filename}</span>
                <span className="file-sub muted">
                  {humanSize(f.sizeBytes)}
                  {f.channelName ? ` · #${f.channelName}` : ''} · {f.uploaderName}
                </span>
              </div>
            </button>
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
