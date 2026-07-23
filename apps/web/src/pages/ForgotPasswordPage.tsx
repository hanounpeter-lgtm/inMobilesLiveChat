import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

/** Request a password reset. Because real email delivery isn't configured, the
 * reset link is shown directly on-screen. */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await api<{ resetUrl: string | null }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }).catch(() => ({ resetUrl: null }));
    setResetUrl(res.resetUrl);
    setDone(true);
    setBusy(false);
  };

  return (
    <div className="fullscreen-center">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <img src="/logo.svg" alt="" className="logo-mark" />
          <h1 className="login-logo">
            in<span>Chat</span>
          </h1>
        </div>
        <p className="muted">Reset your password</p>
        {!done ? (
          <>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@inmobiles.net"
                autoFocus
                required
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
          </>
        ) : (
          <div className="reset-result">
            {resetUrl ? (
              <>
                <p>Use this link to reset your password:</p>
                <a className="reset-link" href={resetUrl}>
                  {resetUrl}
                </a>
                <p className="muted small">
                  (Email delivery isn't configured yet, so the link is shown here.)
                </p>
              </>
            ) : (
              <p className="muted">
                If an account exists for that email, a reset link has been created.
              </p>
            )}
          </div>
        )}
        <p className="muted auth-switch">
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </div>
  );
}
