import { Fragment, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SearchResponse, SearchResultDto } from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { useChatStore } from '../lib/chat-store';

const timeFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Sentinel-delimited highlights (\x01…\x02) → <mark> nodes, XSS-free. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/([\x01\x02])/);
  let inMark = false;
  return (
    <>
      {parts.map((part, i) => {
        if (part === '\x01') {
          inMark = true;
          return null;
        }
        if (part === '\x02') {
          inMark = false;
          return null;
        }
        return inMark ? <mark key={i}>{part}</mark> : <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

function channelLabel(r: SearchResultDto): string {
  if (r.channelType === 'dm' || r.channelType === 'group_dm') return 'Direct message';
  return `${r.channelType === 'private' ? '🔒' : '#'} ${r.channelName}`;
}

export default function SearchModal({ onClose }: { onClose: () => void }) {
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const search = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api<SearchResponse>(`/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.trim().length >= 2,
    staleTime: 30_000,
  });
  const results = search.data?.results ?? [];

  const open = (r: SearchResultDto) => {
    // TODO: jump-to-message (needs around-cursor pagination)
    setActiveChannel(r.channelId);
    onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal search-modal">
        <input
          className="gif-search search-input"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search messages…  (Esc to close)"
        />
        <div className="search-results">
          {results.map((r) => (
            <button key={r.messageId} className="search-row" onClick={() => open(r)}>
              <div className="search-row-top">
                <strong>{r.authorDisplayName}</strong>
                <span className="muted">{channelLabel(r)}</span>
                <span className="muted search-time">{timeFmt.format(new Date(r.createdAt))}</span>
              </div>
              <div className="search-snippet">
                <Snippet text={r.snippet} />
              </div>
            </button>
          ))}
          {search.isFetching && <div className="muted pad-sm">Searching…</div>}
          {search.isSuccess && results.length === 0 && debounced.trim().length >= 2 && (
            <div className="muted pad-sm">No messages match "{debounced}"</div>
          )}
          {debounced.trim().length < 2 && (
            <div className="muted pad-sm">Type at least two characters to search.</div>
          )}
        </div>
      </div>
    </div>
  );
}
