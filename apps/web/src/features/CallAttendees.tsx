import { useState } from 'react';
import { useParticipants } from '@livekit/components-react';
import type { Participant } from 'livekit-client';

/** Live roster of everyone currently in the call. Rendered inside <LiveKitRoom>
 * so useParticipants() updates as people join and leave. */
export default function CallAttendees() {
  const participants = useParticipants();
  return (
    <div className="call-attendees">
      <span className="call-attendees-label">In this call · {participants.length}</span>
      <div className="call-attendees-list">
        {participants.map((p) => (
          <AttendeeChip key={p.sid} participant={p} />
        ))}
      </div>
    </div>
  );
}

function AttendeeChip({ participant }: { participant: Participant }) {
  const [imgFailed, setImgFailed] = useState(false);
  const name = participant.name || participant.identity;
  const initial = (name || '?').charAt(0).toUpperCase();
  const muted = participant.isMicrophoneEnabled === false;
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
    </span>
  );
}
