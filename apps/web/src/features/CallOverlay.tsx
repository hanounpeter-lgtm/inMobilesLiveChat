import { useEffect, useMemo, useRef, useState } from 'react';
import { Room } from 'livekit-client';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';
import type { CallRecordingPayload, JoinCallResponse } from '@inmobiles/shared-types';
import { ServerEvents } from '@inmobiles/shared-types';
import { api, apiUpload } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useChatStore } from '../lib/chat-store';
import { CallAudioRecorder, announceRecording } from '../lib/call-recorder';
import CallAttendees from './CallAttendees';
import CallSideChat from './CallSideChat';

export default function CallOverlay({ join }: { join: JoinCallResponse }) {
  const endCall = useChatStore((s) => s.setCurrentCall);
  const room = useMemo(() => new Room({ adaptiveStream: true, dynacast: true }), []);
  const [recording, setRecording] = useState({
    active: join.call.isRecording,
    by: join.call.isRecording ? 'someone' : '',
  });
  const [busy, setBusy] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const recorderRef = useRef<CallAudioRecorder | null>(null);

  // Joining a call that's already being recorded → immediate consent notice.
  useEffect(() => {
    if (join.call.isRecording) announceRecording(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep recording state in sync for every participant + announce changes.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onRecording = (payload: CallRecordingPayload) => {
      if (payload.callId !== join.call.id) return;
      setRecording({ active: payload.isRecording, by: payload.by });
      announceRecording(payload.isRecording);
      // If someone else stopped the recording, the local recorder must flush.
      if (!payload.isRecording && recorderRef.current?.isActive) {
        void flushLocalRecorder();
      }
    };
    socket.on(ServerEvents.CallRecording, onRecording);
    return () => {
      socket.off(ServerEvents.CallRecording, onRecording);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [join.call.id]);

  const flushLocalRecorder = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorderRef.current = null;
    const blob = await recorder.stop();
    console.info(`[recording] captured blob: ${blob.size} bytes`);
    if (blob.size === 0) return;
    const form = new FormData();
    form.append('file', blob, 'recording.webm');
    await apiUpload(`/calls/${join.call.id}/recording/upload`, form).catch((err) =>
      console.error('[recording] upload failed', err),
    );
  };

  const toggleRecording = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (recorderRef.current?.isActive) {
        await flushLocalRecorder();
        await api(`/calls/${join.call.id}/recording/stop`, { method: 'POST' });
      } else if (!recording.active) {
        await api(`/calls/${join.call.id}/recording/start`, { method: 'POST' });
        const recorder = new CallAudioRecorder();
        recorder.start(room);
        recorderRef.current = recorder;
      }
    } finally {
      setBusy(false);
    }
  };

  const onDisconnected = () => {
    const remaining = room.remoteParticipants.size;
    const finish = async () => {
      if (recorderRef.current?.isActive) {
        await flushLocalRecorder();
        await api(`/calls/${join.call.id}/recording/stop`, { method: 'POST' }).catch(
          () => undefined,
        );
      }
      await api(`/calls/${join.call.id}/leave`, {
        method: 'POST',
        body: JSON.stringify({ remainingParticipants: remaining }),
      }).catch(() => undefined);
    };
    void finish();
    endCall(null);
  };

  const iAmRecorder = recorderRef.current?.isActive ?? false;

  return (
    <div className="call-overlay" data-lk-theme="default">
      <div className="call-topbar">
        {recording.active && (
          <span className="rec-badge" title={`Recording by ${recording.by}`}>
            <span className="rec-dot" /> REC · {recording.by}
          </span>
        )}
        {(!recording.active || iAmRecorder) && (
          <button className="rec-toggle" onClick={() => void toggleRecording()} disabled={busy}>
            {iAmRecorder ? (
              '⏹ Stop recording'
            ) : (
              <>
                <span className="rec-icon" /> Record
              </>
            )}
          </button>
        )}
        <button className="rec-toggle" onClick={() => setChatOpen((v) => !v)}>
          {chatOpen ? '✕ Chat' : '💬 Chat'}
        </button>
      </div>
      {chatOpen && <CallSideChat channelId={join.call.channelId} />}
      <LiveKitRoom
        room={room}
        serverUrl={join.serverUrl}
        token={join.token}
        connect
        video={join.call.type === 'video'}
        audio
        onDisconnected={onDisconnected}
      >
        <CallAttendees isHost={join.isHost} callId={join.call.id} />
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}
