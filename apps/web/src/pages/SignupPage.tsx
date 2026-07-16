import { FormEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { LoginResponse, SignupPreview } from '@inmobiles/shared-types';
import { api, ApiError, setAccessToken } from '../lib/api';
import { connectSocket } from '../lib/socket';
import { useAuth } from '../lib/auth-store';

export default function SignupPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = useQuery({
    queryKey: ['signup', token],
    queryFn: () => api<SignupPreview>(`/signup/${token}`),
    retry: false,
  });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<LoginResponse>(`/signup/${token}`, {
        method: 'POST',
        body: JSON.stringify({ displayName: displayName.trim(), password }),
      });
      setAccessToken(res.accessToken);
      connectSocket(res.accessToken);
      useAuth.setState({ user: res.user, status: 'authenticated' });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account');
      setBusy(false);
    }
  };

  if (preview.isLoading) {
    return <div className="fullscreen-center muted">Checking your invite…</div>;
  }

  if (preview.isError) {
    const err = preview.error;
    const msg =
      err instanceof ApiError && err.status === 410
        ? 'This invite has expired or was already used.'
        : 'This invite link is invalid.';
    return (
      <div className="fullscreen-center">
        <div className="join-card">
          <h2>😕 {msg}</h2>
          <p className="muted">Ask a workspace admin to send you a new one.</p>
        </div>
      </div>
    );
  }

  const p = preview.data!;
  return (
    <div className="fullscreen-center">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="brand">
          <img src="/logo.svg" alt="" className="logo-mark" />
          <h1 className="login-logo">
            in<span>Mobiles</span>
          </h1>
        </div>
        <p className="muted">
          <strong>{p.invitedBy}</strong> invited you to join <strong>{p.workspaceName}</strong>
        </p>
        <label>
          Email
          <input type="email" value={p.email} disabled />
        </label>
        <label>
          Your name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Maria Saleh"
            autoFocus
            required
            maxLength={80}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            minLength={8}
            required
          />
        </label>
        {error && <div className="error-text">{error}</div>}
        <button type="submit" disabled={busy || !displayName.trim() || password.length < 8}>
          {busy ? 'Creating account…' : 'Create account & join'}
        </button>
      </form>
    </div>
  );
}
