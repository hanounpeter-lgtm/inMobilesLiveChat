import type { Room, RemoteTrack } from 'livekit-client';
import { RoomEvent, Track } from 'livekit-client';

/**
 * Client-side call audio recorder: mixes the local microphone and every
 * remote participant's audio through WebAudio into one MediaRecorder stream.
 * Tracks that join mid-recording are added automatically.
 */
export class CallAudioRecorder {
  private ctx = new AudioContext();
  private dest = this.ctx.createMediaStreamDestination();
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private cleanup: (() => void) | null = null;

  private addTrack(track: MediaStreamTrack) {
    try {
      const source = this.ctx.createMediaStreamSource(new MediaStream([track]));
      source.connect(this.dest);
    } catch {
      // Track may already be ended; ignore.
    }
  }

  start(room: Room) {
    // Local microphone.
    for (const pub of room.localParticipant.audioTrackPublications.values()) {
      const track = pub.track?.mediaStreamTrack;
      if (track) this.addTrack(track);
    }
    // Every remote participant already in the room.
    for (const participant of room.remoteParticipants.values()) {
      for (const pub of participant.audioTrackPublications.values()) {
        const track = pub.track?.mediaStreamTrack;
        if (track) this.addTrack(track);
      }
    }
    // Anyone who speaks up later.
    const onSubscribed = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) this.addTrack(track.mediaStreamTrack);
    };
    room.on(RoomEvent.TrackSubscribed, onSubscribed);
    const onLocalPublished = () => {
      for (const pub of room.localParticipant.audioTrackPublications.values()) {
        const track = pub.track?.mediaStreamTrack;
        if (track) this.addTrack(track);
      }
    };
    room.on(RoomEvent.LocalTrackPublished, onLocalPublished);
    this.cleanup = () => {
      room.off(RoomEvent.TrackSubscribed, onSubscribed);
      room.off(RoomEvent.LocalTrackPublished, onLocalPublished);
    };

    this.chunks = [];
    this.recorder = new MediaRecorder(this.dest.stream, { mimeType: 'audio/webm' });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(1000);
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      const recorder = this.recorder;
      this.cleanup?.();
      if (!recorder || recorder.state === 'inactive') {
        resolve(new Blob(this.chunks, { type: 'audio/webm' }));
        return;
      }
      recorder.onstop = () => {
        void this.ctx.close().catch(() => undefined);
        resolve(new Blob(this.chunks, { type: 'audio/webm' }));
      };
      recorder.stop();
    });
  }

  get isActive() {
    return this.recorder?.state === 'recording';
  }
}

/** Chime + spoken consent announcement. Best-effort — never throws. */
export function announceRecording(started: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = started ? 880 : 440;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    setTimeout(() => void ctx.close().catch(() => undefined), 700);
  } catch {
    /* audio blocked */
  }
  try {
    const utterance = new SpeechSynthesisUtterance(
      started ? 'This call is being recorded' : 'Recording has stopped',
    );
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  } catch {
    /* speech unavailable */
  }
}
