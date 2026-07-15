import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import type { ChannelSummary, MessageDto } from '@inmobiles/shared-types';
import { ClientEvents } from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../lib/auth-store';
import StickerPicker from './StickerPicker';
import GifPicker from './GifPicker';
import { stickerContent, type Sticker } from './stickers';
import type { GifDto } from '@inmobiles/shared-types';

const TYPING_THROTTLE_MS = 3000;

export default function Composer({
  channel,
  onOptimisticSend,
}: {
  channel: ChannelSummary;
  onOptimisticSend: (message: MessageDto) => void;
}) {
  const user = useAuth((s) => s.user);
  const [value, setValue] = useState('');
  const [showStickers, setShowStickers] = useState(false);
  const [showGifs, setShowGifs] = useState(false);
  const lastTypingEmit = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [channel.id]);

  const emitTyping = () => {
    const socket = getSocket();
    if (!socket) return;
    const now = Date.now();
    if (now - lastTypingEmit.current > TYPING_THROTTLE_MS) {
      lastTypingEmit.current = now;
      socket.emit(ClientEvents.TypingStart, { channelId: channel.id });
    }
  };

  const stopTyping = () => {
    lastTypingEmit.current = 0;
    getSocket()?.emit(ClientEvents.TypingStop, { channelId: channel.id });
  };

  const send = async (content: string) => {
    if (!content || !user) return;
    stopTyping();

    const clientMsgId = crypto.randomUUID();
    const now = new Date().toISOString();
    // Optimistic message: id === clientMsgId marks it as pending; the
    // authoritative copy (POST response / socket echo) replaces it by clientMsgId.
    onOptimisticSend({
      id: clientMsgId,
      channelId: channel.id,
      parentMessageId: null,
      content,
      clientMsgId,
      author: { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl },
      replyCount: 0,
      isEdited: false,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });

    try {
      const message = await api<MessageDto>(`/channels/${channel.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content, clientMsgId }),
      });
      onOptimisticSend(message);
    } catch {
      // Leave the pending bubble; a retry affordance lands in Phase 1 polish.
    }
  };

  const sendText = () => {
    const content = value.trim();
    if (!content) return;
    setValue('');
    void send(content);
  };

  const sendSticker = (sticker: Sticker) => {
    setShowStickers(false);
    void send(stickerContent(sticker.code));
  };

  const sendGif = (gif: GifDto) => {
    setShowGifs(false);
    void send(`![GIF](${gif.url})`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendText();
    }
  };

  const placeholder =
    channel.type === 'dm' || channel.type === 'group_dm'
      ? 'Write a message…'
      : `Message #${channel.name}`;

  return (
    <div className="composer">
      {showStickers && <StickerPicker onPick={sendSticker} onClose={() => setShowStickers(false)} />}
      {showGifs && <GifPicker onPick={sendGif} onClose={() => setShowGifs(false)} />}
      <button
        className="sticker-btn"
        title="Send a sticker"
        onClick={() => {
          setShowGifs(false);
          setShowStickers((v) => !v);
        }}
      >
        😀
      </button>
      <button
        className="sticker-btn gif-btn"
        title="Search GIFs"
        onClick={() => {
          setShowStickers(false);
          setShowGifs((v) => !v);
        }}
      >
        GIF
      </button>
      <textarea
        ref={textareaRef}
        value={value}
        placeholder={placeholder}
        rows={Math.min(8, value.split('\n').length)}
        onChange={(e) => {
          setValue(e.target.value);
          if (e.target.value) emitTyping();
          else stopTyping();
        }}
        onKeyDown={onKeyDown}
        onBlur={stopTyping}
      />
      <button className="send-btn" onClick={sendText} disabled={!value.trim()}>
        Send
      </button>
    </div>
  );
}
