import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LoginResponse } from '@inmobiles/shared-types';
import { api, setAccessToken } from '../lib/api';
import { connectSocket } from '../lib/socket';
import { useAuth } from '../lib/auth-store';

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.toLowerCase().endsWith('@inmobiles.net')) {
      setError('Use your @inmobiles.net email address');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api<LoginResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ displayName: displayName.trim(), email, password }),
      });
      setAccessToken(res.accessToken);
      connectSocket(res.accessToken);
      useAuth.setState({ user: res.user, status: 'authenticated' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account');
      setBusy(false);
    }
  };

  return (
    <div className="fullscreen-center">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="brand">
          <img src="/logo.svg" alt="" className="logo-mark" />
          <h1 className="login-logo">
            in<span>Chat</span>
          </h1>
        </div>
        <p className="muted">Create your account</p>
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
          Email <span className="muted">(must be @inmobiles.net)</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@inmobiles.net"
            required
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
        <button type="submit" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
        <p className="muted auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
