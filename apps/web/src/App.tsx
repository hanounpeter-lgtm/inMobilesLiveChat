import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth-store';
import LoginPage from './pages/LoginPage';
import AppShell from './pages/AppShell';
import JoinPage from './pages/JoinPage';
import SignupPage from './pages/SignupPage';
import RegisterPage from './pages/RegisterPage';

const REDIRECT_KEY = 'postLoginRedirect';

/** Remember where the user was headed (e.g. an invite link), then log in. */
function SaveRedirectAndLogin() {
  const location = useLocation();
  useEffect(() => {
    sessionStorage.setItem(REDIRECT_KEY, location.pathname);
  }, [location.pathname]);
  return <Navigate to="/login" replace />;
}

function PostLoginTarget() {
  // Read purely during render (StrictMode renders twice — a remove here would
  // erase the target before the second render); clear it after commit.
  const [target] = useState(() => sessionStorage.getItem(REDIRECT_KEY));
  useEffect(() => {
    sessionStorage.removeItem(REDIRECT_KEY);
  }, []);
  return <Navigate to={target ?? '/'} replace />;
}

export default function App() {
  const { status, bootstrap } = useAuth();

  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'loading') {
    return <div className="fullscreen-center muted">Loading…</div>;
  }

  const authed = status === 'authenticated';

  return (
    <Routes>
      <Route path="/login" element={authed ? <PostLoginTarget /> : <LoginPage />} />
      <Route path="/join/:token" element={authed ? <JoinPage /> : <SaveRedirectAndLogin />} />
      <Route path="/signup/:token" element={<SignupPage />} />
      <Route
        path="/register"
        element={authed ? <Navigate to="/" replace /> : <RegisterPage />}
      />
      <Route path="/*" element={authed ? <AppShell /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}
