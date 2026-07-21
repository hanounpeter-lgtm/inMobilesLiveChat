import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthUser } from '@inmobiles/shared-types';
import { api, apiUpload } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { IconVideo } from '../components/icons';
import {
  ACCENT_PRESETS,
  getAccent,
  getTheme,
  setAccent,
  setTheme,
  type ThemeMode,
} from '../lib/theme';

interface ProfileUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  statusText: string | null;
  department?: string | null;
  jobTitle?: string | null;
}

export default function ProfileModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [statusText, setStatusText] = useState(user?.statusText ?? '');
  const [department, setDepartment] = useState(user?.department ?? '');
  const [jobTitle, setJobTitle] = useState(user?.jobTitle ?? '');
  const [theme, setThemeState] = useState<ThemeMode>(getTheme());
  const [accent, setAccentState] = useState<string | null>(getAccent());
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopCamera();
        onClose();
      }
    };
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('keydown', onEsc);
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const applyUser = (updated: ProfileUser) => {
    setAvatarUrl(updated.avatarUrl);
    useAuth.setState((s) => ({
      user: s.user ? ({ ...s.user, ...updated } as AuthUser) : s.user,
    }));
    // The socket echo also invalidates, but be immediate locally.
    void queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const uploadBlob = async (blob: Blob, filename: string) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', blob, filename);
      const updated = await apiUpload<ProfileUser>('/users/me/avatar', form);
      applyUser(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
      });
      streamRef.current = stream;
      setCameraOn(true);
    } catch {
      setError('Camera unavailable — check permissions');
    }
  };

  // Attach the stream once the <video> exists (render commit after setCameraOn).
  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [cameraOn]);

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.videoWidth === 0) {
      // First frame not decoded yet — capture as soon as it is.
      video.addEventListener('loadeddata', () => capturePhoto(), { once: true });
      return;
    }
    // Center-crop to a square.
    const size = Math.min(video.videoWidth, video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(
      video,
      (video.videoWidth - size) / 2,
      (video.videoHeight - size) / 2,
      size,
      size,
      0,
      0,
      256,
      256,
    );
    stopCamera();
    canvas.toBlob(
      (blob) => {
        if (blob) void uploadBlob(blob, 'camera.jpg');
      },
      'image/jpeg',
      0.9,
    );
  };

  const removeAvatar = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api<ProfileUser>('/users/me/avatar', { method: 'DELETE' });
      applyUser(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove photo');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api<ProfileUser>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: displayName.trim(),
          statusText: statusText.trim() || null,
          department: department.trim() || null,
          jobTitle: jobTitle.trim() || null,
        }),
      });
      applyUser(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile');
      setBusy(false);
    }
  };

  const initial = (displayName || user?.displayName || '?').slice(0, 1).toUpperCase();

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          stopCamera();
          onClose();
        }
      }}
    >
      <div className="modal profile-modal">
        <h3 className="modal-title">Your profile</h3>

        <div className="avatar-editor">
          {cameraOn ? (
            <video ref={videoRef} className="camera-view" muted playsInline />
          ) : avatarUrl ? (
            <img className="avatar-preview" src={avatarUrl} alt="Your avatar" />
          ) : (
            <div className="avatar-preview avatar-letter">{initial}</div>
          )}

          <div className="avatar-actions">
            {cameraOn ? (
              <>
                <button className="btn-primary" onClick={capturePhoto}>
                  Capture
                </button>
                <button className="btn-secondary" onClick={stopCamera}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  Upload photo
                </button>
                <button className="btn-secondary" disabled={busy} onClick={() => void startCamera()}>
                  <IconVideo size={14} /> Take photo
                </button>
                {avatarUrl && (
                  <button className="btn-danger" disabled={busy} onClick={() => void removeAvatar()}>
                    Remove
                  </button>
                )}
              </>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            data-testid="avatar-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadBlob(file, file.name);
              e.target.value = '';
            }}
          />
        </div>

        <label className="field">
          Display name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={80}
          />
        </label>
        <label className="field">
          Status <span className="muted">(optional — e.g. "In a meeting")</span>
          <input
            value={statusText}
            onChange={(e) => setStatusText(e.target.value)}
            placeholder="What's happening?"
            maxLength={100}
          />
        </label>
        <div className="field-row">
          <label className="field">
            Job title <span className="muted">(optional)</span>
            <input
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Backend Engineer"
              maxLength={80}
            />
          </label>
          <label className="field">
            Department <span className="muted">(optional)</span>
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Engineering"
              maxLength={80}
            />
          </label>
        </div>
        <div className="field">
          Appearance
          <div className="theme-toggle">
            {(['light', 'dark', 'system'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`theme-opt${theme === m ? ' active' : ''}`}
                onClick={() => {
                  setTheme(m);
                  setThemeState(m);
                }}
              >
                {m === 'light' ? '☀ Light' : m === 'dark' ? '☾ Dark' : '🖥 System'}
              </button>
            ))}
          </div>
          <div className="accent-swatches">
            {ACCENT_PRESETS.map((p) => (
              <button
                key={p.hex}
                type="button"
                className={`accent-swatch${(accent ?? '#2e6b4f').toLowerCase() === p.hex ? ' active' : ''}`}
                style={{ background: p.hex }}
                title={p.name}
                onClick={() => {
                  setAccent(p.hex);
                  setAccentState(p.hex);
                }}
              />
            ))}
            <label className="accent-custom" title="Custom color">
              <input
                type="color"
                value={accent ?? '#2e6b4f'}
                onChange={(e) => {
                  setAccent(e.target.value);
                  setAccentState(e.target.value);
                }}
              />
            </label>
            {accent && (
              <button
                type="button"
                className="btn-secondary accent-reset"
                onClick={() => {
                  setAccent(null);
                  setAccentState(null);
                }}
              >
                Reset
              </button>
            )}
          </div>
        </div>
        {error && <div className="error-text">{error}</div>}

        <div className="modal-actions">
          <button
            className="btn-secondary"
            onClick={() => {
              stopCamera();
              onClose();
            }}
          >
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={busy || !displayName.trim()}
            onClick={() => void save()}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
