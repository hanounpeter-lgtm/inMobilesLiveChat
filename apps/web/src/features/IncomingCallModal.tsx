import { useEffect } from 'react';
import type { CallRingPayload, JoinCallResponse } from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { useChatStore } from '../lib/chat-store';
import { IconPhone, IconVideo } from '../components/icons';

/** Ringing prompt for an incoming DM call — accept joins it, decline records a miss. */
export default function IncomingCallModal({ ring }: { ring: CallRingPayload }) {
  const setIncomingCall = useChatStore((s) => s.setIncomingCall);
  const setCurrentCall = useChatStore((s) => s.setCurrentCall);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);

  // Auto-dismiss after 30s if unanswered (the caller's hang-up also stops it).
  useEffect(() => {
    const t = setTimeout(() => setIncomingCall(null), 30_000);
    return () => clearTimeout(t);
  }, [ring.callId, setIncomingCall]);

  const accept = async () => {
    setIncomingCall(null);
    try {
      const join = await api<JoinCallResponse>(`/channels/${ring.channelId}/call`, {
        method: 'POST',
        body: JSON.stringify({ type: ring.type }),
      });
      setActiveChannel(ring.channelId);
      setCurrentCall(join);
    } catch {
      /* call may have ended */
    }
  };

  const decline = async () => {
    setIncomingCall(null);
    await api(`/calls/${ring.callId}/decline`, { method: 'POST' }).catch(() => undefined);
  };

  return (
    <div className="incoming-call">
      <div className="incoming-card">
        <div className="incoming-avatar">
          {ring.from.avatarUrl ? (
            <img src={ring.from.avatarUrl} alt="" />
          ) : (
            <span>{ring.from.displayName.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className="incoming-text">
          <strong>{ring.from.displayName}</strong>
          <span className="muted">
            Incoming {ring.type === 'video' ? 'video' : 'audio'} call…
          </span>
        </div>
        <div className="incoming-actions">
          <button className="incoming-decline" onClick={() => void decline()}>
            Decline
          </button>
          <button className="incoming-accept" onClick={() => void accept()}>
            {ring.type === 'video' ? <IconVideo size={16} /> : <IconPhone size={16} />} Accept
          </button>
        </div>
      </div>
    </div>
  );
}
