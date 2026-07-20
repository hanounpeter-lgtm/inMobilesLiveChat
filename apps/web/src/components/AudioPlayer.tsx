import { useEffect, useRef, useState } from 'react';
import { IconPause, IconPlay } from './icons';

const fmt = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

/** Themed audio player replacing the browser default controls. */
export default function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);

  const RATES = [0.5, 1, 1.5, 2] as const;
  const cycleRate = () => {
    const next = RATES[(RATES.indexOf(rate as (typeof RATES)[number]) + 1) % RATES.length];
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => {
      // MediaRecorder webm blobs report Infinity until forced to the end.
      if (audio.duration === Infinity) {
        const restore = () => {
          audio.currentTime = 0;
          setDuration(audio.duration);
          audio.removeEventListener('timeupdate', restore);
        };
        audio.addEventListener('timeupdate', restore);
        audio.currentTime = 1e7;
      } else {
        setDuration(audio.duration);
      }
    };
    const onTime = () => {
      setCurrent(audio.currentTime);
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
      audio.currentTime = 0;
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [src]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = rate; // some browsers reset rate on load
    if (audio.paused) void audio.play().catch(() => undefined);
    else audio.pause();
  };

  const seek = (e: React.MouseEvent) => {
    const audio = audioRef.current;
    const bar = barRef.current;
    if (!audio || !bar || !Number.isFinite(duration) || duration === 0) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrent(audio.currentTime);
  };

  const progress = duration > 0 && Number.isFinite(duration) ? (current / duration) * 100 : 0;

  return (
    <div className="audio-player">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        className="audio-play"
        title={playing ? 'Pause' : 'Play'}
        onClick={toggle}
        data-playing={playing}
      >
        {playing ? <IconPause size={13} /> : <IconPlay size={13} />}
      </button>
      <span className="audio-time">{fmt(current)}</span>
      <div className="audio-bar" ref={barRef} onClick={seek}>
        <div className="audio-bar-fill" style={{ width: `${progress}%` }} />
        <div className="audio-bar-knob" style={{ left: `${progress}%` }} />
      </div>
      <span className="audio-time audio-duration">{fmt(duration)}</span>
      <button className="audio-rate" title="Playback speed" onClick={cycleRate}>
        {rate}×
      </button>
    </div>
  );
}
