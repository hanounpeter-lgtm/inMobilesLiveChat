import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MessageDto, MessagePage } from '@inmobiles/shared-types';
import { ServerEvents } from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../lib/auth-store';

/** Lightweight in-call chat bound to the call's channel. */
export default function CallSideChat({ channelId }: { channelId: string }) {
  const me = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [msgs, setMsgs] = useState<MessageDto[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['call-chat', channelId],
    queryFn: () => api<MessagePage>(`/channels/${channelId}/messages`),
  });
  useEffect(() => {
    if (data) setMsgs(data.messages.slice(-30));
  }, [data]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onNew = ({ message }: { message: MessageDto }) => {
      if (message.channelId === channelId) setMsgs((m) => [...m, message].slice(-40));
    };
    socket.on(ServerEvents.MessageNew, onNew);
    return () => {
      socket.off(ServerEvents.MessageNew, onNew);
    };
  }, [channelId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [msgs]);

  const send = async () => {
    const content = text.trim();
    if (!content) return;
    setText('');
    await api<MessageDto>(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, clientMsgId: crypto.randomUUID() }),
    }).catch(() => undefined);
    void queryClient.invalidateQueries({ queryKey: ['messages', channelId] });
  };

  return (
    <div className="call-sidechat">
      <div className="call-sidechat-title">In-call chat</div>
      <div className="call-sidechat-messages">
        {msgs.map((m) => (
          <div key={m.clientMsgId} className={`call-chat-line${m.author.id === me?.id ? ' mine' : ''}`}>
            <span className="call-chat-author">{m.author.displayName}</span>
            <span className="call-chat-text">{m.content}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="call-sidechat-input">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void send()}
          placeholder="Message…"
        />
        <button onClick={() => void send()}>Send</button>
      </div>
    </div>
  );
}
