import { useState } from 'react';
import { useParticipants } from '@livekit/components-react';
import type { Participant } from 'livekit-client';
import { api } from '../lib/api';

/** Live roster of everyone currently in the call. Rendered inside <LiveKitRoom>
 * so useParticipants() updates as people join and leave. The host can grant
 * screen-share permission to any other participant. */
export default function CallAttendees({ isHost, callId }: { isHost: boolean; callId: string }) {
  const participants = useParticipants();
  return (
    <div className="call-attendees">
      <span className="call-attendees-label">In this call · {participants.length}</span>
      <div className="call-attendees-list">
        {participants.map((p) => (
          <AttendeeChip key={p.sid} participant={p} isHost={isHost} callId={callId} />
        ))}
      </div>
    </div>
  );
}

function AttendeeChip({
  participant,
  isHost,
  callId,
}: {
  participant: Participant;
  isHost: boolean;
  callId: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const [granted, setGranted] = useState(false);
  const name = participant.name || participant.identity;
  const initial = (name || '?').charAt(0).toUpperCase();
  const muted = participant.isMicrophoneEnabled === false;

  const grant = async () => {
    setGranted(true);
    await api(`/calls/${callId}/screenshare/${participant.identity}`, { method: 'POST' }).catch(
      () => setGranted(false),
    );
  };

  return (
    <span
      className={`attendee-chip${participant.isSpeaking ? ' is-speaking' : ''}`}
      title={muted ? `${name} (muted)` : name}
    >
      <span className="attendee-avatar">
        {imgFailed ? (
          <span className="attendee-initial">{initial}</span>
        ) : (
          <img src={`/api/avatars/${participant.identity}`} alt="" onError={() => setImgFailed(true)} />
        )}
      </span>
      <span className="attendee-name">
        {name}
        {participant.isLocal && ' (you)'}
      </span>
      {muted && <span className="attendee-mute" aria-label="muted">🔇</span>}
      {isHost && !participant.isLocal && (
        <button
          className="attendee-grant"
          disabled={granted}
          title="Allow this person to screen-share"
          onClick={() => void grant()}
        >
          {granted ? '✓ shared' : 'Allow share'}
        </button>
      )}
    </span>
  );
}
