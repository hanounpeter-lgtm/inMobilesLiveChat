import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { GifDto } from '@inmobiles/shared-types';
import { api, ApiError } from '../lib/api';

export default function GifPicker({
  onPick,
  onClose,
}: {
  onPick: (gif: GifDto) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  const gifs = useQuery({
    queryKey: ['gifs', debounced],
    queryFn: () => api<{ gifs: GifDto[] }>(`/gifs/search?q=${encodeURIComponent(debounced)}`),
    retry: false,
    staleTime: 60_000,
  });

  const notConfigured = gifs.error instanceof ApiError && gifs.error.status === 503;

  return (
    <div className="sticker-picker gif-picker" ref={ref}>
      <div className="sticker-picker-title muted">GIFs</div>
      <input
        className="gif-search"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search GIFs…"
      />
      {notConfigured ? (
        <div className="muted gif-help">
          GIF search needs a free Tenor API key.
          <br />
          1. Get one at <strong>developers.google.com/tenor</strong> (2 min)
          <br />
          2. Put it in <code>.env</code> as <code>TENOR_API_KEY=…</code>
          <br />
          3. Restart the API server.
        </div>
      ) : gifs.isError ? (
        <div className="muted gif-help">GIF search failed — try again.</div>
      ) : (
        <div className="gif-grid">
          {(gifs.data?.gifs ?? []).map((g) => (
            <button key={g.id} className="gif-cell" onClick={() => onPick(g)}>
              <img src={g.preview} alt="GIF" loading="lazy" />
            </button>
          ))}
          {gifs.isLoading && <div className="muted pad-sm">Searching…</div>}
          {gifs.isSuccess && gifs.data.gifs.length === 0 && (
            <div className="muted pad-sm">No GIFs found</div>
          )}
        </div>
      )}
    </div>
  );
}
