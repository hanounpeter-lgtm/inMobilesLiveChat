import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PollDto } from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { ServerEvents } from '@inmobiles/shared-types';

export const POLL_RE = /^\[poll:([0-9a-f-]{36})\]$/;

/** Interactive poll rendered in place of a [poll:<id>] message. */
export default function PollMessage({ pollId }: { pollId: string }) {
  const queryClient = useQueryClient();
  const { data: poll } = useQuery({
    queryKey: ['poll', pollId],
    queryFn: () => api<PollDto>(`/polls/${pollId}`),
  });

  // Live updates when anyone votes.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onUpdate = (p: { pollId: string }) => {
      if (p.pollId === pollId) queryClient.invalidateQueries({ queryKey: ['poll', pollId] });
    };
    socket.on(ServerEvents.PollUpdate, onUpdate);
    return () => {
      socket.off(ServerEvents.PollUpdate, onUpdate);
    };
  }, [pollId, queryClient]);

  if (!poll) return <div className="poll-card muted">Loading poll…</div>;

  const vote = (optionId: string) =>
    api<PollDto>(`/polls/${pollId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ optionId }),
    })
      .then((fresh) => queryClient.setQueryData(['poll', pollId], fresh))
      .catch(() => undefined);

  return (
    <div className="poll-card">
      <div className="poll-question">📊 {poll.question}</div>
      <div className="poll-options">
        {poll.options.map((o) => {
          const pct = poll.totalVotes ? Math.round((o.votes / poll.totalVotes) * 100) : 0;
          const mine = poll.myVotes.includes(o.id);
          return (
            <button
              key={o.id}
              className={`poll-option${mine ? ' voted' : ''}`}
              onClick={() => void vote(o.id)}
            >
              <span className="poll-bar" style={{ width: `${pct}%` }} />
              <span className="poll-option-text">
                {mine ? '☑' : '☐'} {o.text}
              </span>
              <span className="poll-option-count">
                {o.votes} · {pct}%
              </span>
            </button>
          );
        })}
      </div>
      <div className="poll-footer muted">
        {poll.totalVotes} vote{poll.totalVotes === 1 ? '' : 's'}
        {poll.multiple ? ' · multiple choice' : ''}
      </div>
    </div>
  );
}
