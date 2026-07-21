import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  ChannelMemberDto,
  ChannelSummary,
  MessageAttachmentDto,
  MessageDto,
  UploadedAttachmentDto,
} from '@inmobiles/shared-types';
import { ClientEvents } from '@inmobiles/shared-types';
import { api, apiUpload, apiUploadWithProgress } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../lib/auth-store';
import { useChatStore } from '../lib/chat-store';
import StickerPicker from './StickerPicker';
import GifPicker from './GifPicker';
import { IconFile, IconMic, IconPaperclip, IconSmile, IconX } from '../components/icons';
import { stickerContent, type Sticker } from './stickers';
import type { GifDto } from '@inmobiles/shared-types';

const TYPING_THROTTLE_MS = 3000;

interface PendingUpload {
  localId: string;
  file: File;
  previewUrl: string | null;
  progress: number;
  uploaded: UploadedAttachmentDto | null;
  error: string | null;
}

const MAX_ATTACHMENTS = 10;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_FILE_BYTES = 100 * 1024 * 1024;

interface MentionTokenState {
  start: number; // index of the '@' in the value
  caret: number; // caret position when detected
  query: string;
}

interface MentionCandidate {
  id: string; // userId or the literal 'channel'
  displayName: string;
}

/** Find an in-progress @token immediately before the caret. */
function detectMentionToken(value: string, caret: number): MentionTokenState | null {
  const before = value.slice(0, caret);
  const match = /(^|\s)@([\w .-]{0,30})$/.exec(before);
  if (!match) return null;
  return { start: caret - match[2].length - 1, caret, query: match[2] };
}

export default function Composer({
  channel,
  onOptimisticSend,
  parentMessageId,
}: {
  channel: ChannelSummary;
  onOptimisticSend: (message: MessageDto) => void;
  /** When set, sends thread replies instead of top-level messages. */
  parentMessageId?: string;
}) {
  const user = useAuth((s) => s.user);
  const [value, setValue] = useState('');
  const [showStickers, setShowStickers] = useState(false);
  const [showGifs, setShowGifs] = useState(false);
  const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'sending'>('idle');
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const voiceRecorder = useRef<MediaRecorder | null>(null);
  const voiceChunks = useRef<Blob[]>([]);
  const voiceTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTypingEmit = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mentionToken, setMentionToken] = useState<MentionTokenState | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionMapRef = useRef(new Map<string, string>()); // displayName -> userId

  const isDmChannel = channel.type === 'dm' || channel.type === 'group_dm';
  const membersQuery = useQuery({
    queryKey: ['channel-members', channel.id],
    queryFn: () => api<{ members: ChannelMemberDto[] }>(`/channels/${channel.id}/members`),
    enabled: mentionToken !== null,
    staleTime: 60_000,
  });

  const mentionCandidates = useMemo<MentionCandidate[]>(() => {
    if (!mentionToken) return [];
    const q = mentionToken.query.toLowerCase();
    const people = (membersQuery.data?.members ?? [])
      .filter((m) => m.id !== user?.id && m.displayName.toLowerCase().includes(q))
      .slice(0, 6)
      .map((m) => ({ id: m.id, displayName: m.displayName }));
    if (!isDmChannel && 'channel'.startsWith(q)) {
      people.push({ id: 'channel', displayName: 'channel' });
    }
    return people;
  }, [mentionToken, membersQuery.data, user?.id, isDmChannel]);

  const pickMention = (candidate: MentionCandidate) => {
    if (!mentionToken) return;
    const insert = `@${candidate.displayName} `;
    const next =
      value.slice(0, mentionToken.start) + insert + value.slice(mentionToken.caret);
    if (candidate.id !== 'channel') {
      mentionMapRef.current.set(candidate.displayName, candidate.id);
    }
    setValue(next);
    setMentionToken(null);
    const el = textareaRef.current;
    if (el) {
      const pos = mentionToken.start + insert.length;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(pos, pos);
      });
    }
  };

  /** Convert picked @Display Name tokens to durable <@id> tokens. */
  const applyMentionTokens = (raw: string): string => {
    let content = raw;
    const entries = [...mentionMapRef.current.entries()].sort(
      (a, b) => b[0].length - a[0].length,
    );
    for (const [name, id] of entries) {
      content = content.split(`@${name}`).join(`<@${id}>`);
    }
    content = content.replace(/(^|\s)@channel\b/g, '$1<!channel>');
    return content;
  };

  const stopVoiceHardware = () => {
    if (voiceTimer.current) clearInterval(voiceTimer.current);
    voiceTimer.current = null;
    const rec = voiceRecorder.current;
    voiceRecorder.current = null;
    if (rec && rec.state !== 'inactive') rec.stop();
    rec?.stream.getTracks().forEach((t) => t.stop());
  };

  // Release the microphone when leaving the channel mid-recording.
  useEffect(() => stopVoiceHardware, [channel.id]);

  const startVoiceNote = async () => {
    setVoiceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      voiceChunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) voiceChunks.current.push(e.data);
      };
      rec.start(500);
      voiceRecorder.current = rec;
      setVoiceSeconds(0);
      voiceTimer.current = setInterval(() => setVoiceSeconds((s) => s + 1), 1000);
      setVoiceState('recording');
    } catch {
      setVoiceError('Microphone unavailable — check permissions');
    }
  };

  const cancelVoiceNote = () => {
    stopVoiceHardware();
    voiceChunks.current = [];
    setVoiceState('idle');
  };

  const sendVoiceNote = async () => {
    const rec = voiceRecorder.current;
    if (!rec) return;
    setVoiceState('sending');
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      stopVoiceHardware();
    });
    const blob = new Blob(voiceChunks.current, { type: 'audio/webm' });
    voiceChunks.current = [];
    try {
      if (blob.size === 0) throw new Error('empty');
      const form = new FormData();
      form.append('file', blob, 'voice-note.webm');
      await apiUpload(`/channels/${channel.id}/voice-notes`, form);
    } catch {
      setVoiceError('Could not send the voice note');
    } finally {
      setVoiceState('idle');
    }
  };

  useEffect(() => {
    textareaRef.current?.focus();
  }, [channel.id]);

  const patchUpload = (localId: string, patch: Partial<PendingUpload>) =>
    setUploads((list) => list.map((u) => (u.localId === localId ? { ...u, ...patch } : u)));

  const addFiles = (files: File[]) => {
    const room = MAX_ATTACHMENTS - uploads.length;
    for (const file of files.slice(0, room)) {
      const localId = crypto.randomUUID();
      const isImage = file.type.startsWith('image/');
      const tooBig = isImage ? file.size > MAX_IMAGE_BYTES : file.size > MAX_FILE_BYTES;
      const entry: PendingUpload = {
        localId,
        file,
        previewUrl: isImage ? URL.createObjectURL(file) : null,
        progress: 0,
        uploaded: null,
        error: tooBig ? (isImage ? 'Images max 25 MB' : 'Files max 100 MB') : null,
      };
      setUploads((list) => [...list, entry]);
      if (tooBig) continue;
      const form = new FormData();
      form.append('file', file, file.name);
      apiUploadWithProgress<UploadedAttachmentDto>(
        `/channels/${channel.id}/attachments`,
        form,
        (pct) => patchUpload(localId, { progress: pct }),
      )
        .then((uploaded) => patchUpload(localId, { uploaded, progress: 100 }))
        .catch((err) =>
          patchUpload(localId, { error: err instanceof Error ? err.message : 'Upload failed' }),
        );
    }
  };

  const removeUpload = (localId: string) =>
    setUploads((list) => {
      const entry = list.find((u) => u.localId === localId);
      if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      return list.filter((u) => u.localId !== localId);
    });

  // Consume files dropped onto the message pane.
  const composerFiles = useChatStore((s) => s.composerFiles);
  const setComposerFiles = useChatStore((s) => s.setComposerFiles);
  useEffect(() => {
    if (!composerFiles?.length) return;
    addFiles(composerFiles);
    setComposerFiles(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerFiles]);

  const uploadsInFlight = uploads.some((u) => !u.uploaded && !u.error);
  const readyAttachments = uploads.filter((u) => u.uploaded).map((u) => u.uploaded!);

  // Consume queued inserts (quote reply from the context menu).
  const composerInsert = useChatStore((s) => s.composerInsert);
  const setComposerInsert = useChatStore((s) => s.setComposerInsert);
  useEffect(() => {
    if (!composerInsert) return;
    setValue((v) => (v ? `${v}\n${composerInsert}` : composerInsert));
    setComposerInsert(null);
    textareaRef.current?.focus();
  }, [composerInsert, setComposerInsert]);

  const emitTyping = () => {
    if (parentMessageId) return; // channel-level typing would be misleading
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

  const send = async (
    content: string,
    attachments: MessageAttachmentDto[] = [],
    attachmentIds: string[] = [],
  ) => {
    if ((!content && attachmentIds.length === 0) || !user) return;
    stopTyping();

    const clientMsgId = crypto.randomUUID();
    const now = new Date().toISOString();
    // Optimistic message: id === clientMsgId marks it as pending; the
    // authoritative copy (POST response / socket echo) replaces it by clientMsgId.
    onOptimisticSend({
      id: clientMsgId,
      channelId: channel.id,
      parentMessageId: parentMessageId ?? null,
      lastReplyAt: null,
      content,
      clientMsgId,
      author: { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl },
      replyCount: 0,
      isEdited: false,
      isDeleted: false,
      isPinned: false,
      reactions: [],
      attachments,
      isSaved: false,
      forwardedFrom: null,
      createdAt: now,
      updatedAt: now,
    });

    try {
      const message = await api<MessageDto>(`/channels/${channel.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content,
          clientMsgId,
          ...(parentMessageId ? { parentMessageId } : {}),
          ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
        }),
      });
      onOptimisticSend(message);
    } catch {
      // Leave the pending bubble; a retry affordance lands in Phase 1 polish.
    }
  };

  const sendText = () => {
    const content = applyMentionTokens(value.trim());
    if (uploadsInFlight) return;
    if (!content && readyAttachments.length === 0) return;
    const attachmentIds = readyAttachments.map((a) => a.id);
    const attachmentDtos: MessageAttachmentDto[] = readyAttachments.map((a) => ({ ...a }));
    setValue('');
    setMentionToken(null);
    mentionMapRef.current.clear();
    for (const u of uploads) if (u.previewUrl) URL.revokeObjectURL(u.previewUrl);
    setUploads([]);
    void send(content, attachmentDtos, attachmentIds);
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
    // Typeahead navigation takes priority over send.
    if (mentionToken && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionCandidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pickMention(mentionCandidates[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setMentionToken(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendText();
    }
  };

  const placeholder = parentMessageId
    ? 'Reply…'
    : channel.type === 'dm' || channel.type === 'group_dm'
      ? 'Write a message…'
      : `Message #${channel.name}`;

  if (voiceState !== 'idle') {
    const mm = String(Math.floor(voiceSeconds / 60)).padStart(2, '0');
    const ss = String(voiceSeconds % 60).padStart(2, '0');
    return (
      <div className="composer voice-recording">
        <span className="rec-dot" />
        <span className="voice-timer">
          {voiceState === 'sending' ? 'Sending…' : `Recording ${mm}:${ss}`}
        </span>
        <div className="voice-actions">
          <button className="btn-secondary" onClick={cancelVoiceNote} disabled={voiceState === 'sending'}>
            Cancel
          </button>
          <button
            className="send-btn"
            onClick={() => void sendVoiceNote()}
            disabled={voiceState === 'sending'}
          >
            Send voice note
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="composer composer-with-chips">
      {uploads.length > 0 && (
        <div className="attachment-chips">
          {uploads.map((u) => (
            <div key={u.localId} className={`attachment-chip ${u.error ? 'chip-error' : ''}`}>
              {u.previewUrl ? (
                <img src={u.previewUrl} alt="" className="chip-thumb" />
              ) : (
                <span className="chip-icon">
                  <IconFile size={15} />
                </span>
              )}
              <span className="chip-name">{u.file.name}</span>
              {u.error ? (
                <span className="error-text">{u.error}</span>
              ) : !u.uploaded ? (
                <span className="muted chip-progress">{u.progress}%</span>
              ) : (
                <span className="chip-done">✓</span>
              )}
              <button className="icon-btn chip-remove" onClick={() => removeUpload(u.localId)}>
                <IconX size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
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
        <IconSmile />
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
      {!parentMessageId && (
        <button
          className="sticker-btn"
          title="Record a voice note"
          onClick={() => void startVoiceNote()}
        >
          <IconMic />
        </button>
      )}
      <button
        className="sticker-btn"
        title="Attach files"
        onClick={() => fileInputRef.current?.click()}
      >
        <IconPaperclip />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        data-testid="file-input"
        onChange={(e) => {
          addFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      {voiceError && <span className="error-text voice-error">{voiceError}</span>}
      <textarea
        ref={textareaRef}
        value={value}
        placeholder={placeholder}
        rows={Math.min(8, value.split('\n').length)}
        onChange={(e) => {
          setValue(e.target.value);
          const token = detectMentionToken(e.target.value, e.target.selectionStart ?? 0);
          setMentionToken(token);
          if (token) setMentionIndex(0);
          if (e.target.value) emitTyping();
          else stopTyping();
        }}
        onKeyDown={onKeyDown}
        onBlur={stopTyping}
        onPaste={(e) => {
          const files = [...(e.clipboardData?.files ?? [])];
          if (files.length > 0) {
            e.preventDefault();
            addFiles(files);
          }
        }}
      />
      {mentionToken && mentionCandidates.length > 0 && (
        <div className="mention-popover">
          {mentionCandidates.map((c, i) => (
            <button
              key={c.id}
              className={`mention-option ${i === mentionIndex ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault(); // keep textarea focus
                pickMention(c);
              }}
            >
              @{c.displayName}
              {c.id === 'channel' && <span className="muted"> — notify everyone</span>}
            </button>
          ))}
        </div>
      )}
      <button
        className="send-btn"
        onClick={sendText}
        disabled={uploadsInFlight || (!value.trim() && readyAttachments.length === 0)}
      >
        {uploadsInFlight ? 'Uploading…' : 'Send'}
      </button>
    </div>
  );
}
