import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'working' | 'ok' | 'error'>('working');

  useEffect(() => {
    if (!token) {
      setState('error');
      return;
    }
    api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) })
      .then(() => setState('ok'))
      .catch(() => setState('error'));
  }, [token]);

  return (
    <div className="fullscreen-center">
      <div className="login-card">
        <div className="brand">
          <img src="/logo.svg" alt="" className="logo-mark" />
          <h1 className="login-logo">
            in<span>Chat</span>
          </h1>
        </div>
        {state === 'working' && <p className="muted">Verifying your email…</p>}
        {state === 'ok' && <p className="reset-result">✓ Your email is verified. You can sign in now.</p>}
        {state === 'error' && <p className="error-text">This verification link is invalid or expired.</p>}
        <p className="muted auth-switch">
          <Link to="/login">Go to sign in</Link>
        </p>
      </div>
    </div>
  );
}
