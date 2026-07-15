import { create } from 'zustand';
import type { AuthUser, LoginResponse } from '@inmobiles/shared-types';
import { api, setAccessToken, tryRefresh, getAccessToken } from './api';
import { connectSocket, disconnectSocket } from './socket';

interface AuthState {
  user: AuthUser | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'loading',

  async login(email, password) {
    const res = await api<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAccessToken(res.accessToken);
    connectSocket(res.accessToken);
    set({ user: res.user, status: 'authenticated' });
  },

  async logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAccessToken(null);
    disconnectSocket();
    set({ user: null, status: 'anonymous' });
  },

  async bootstrap() {
    const ok = await tryRefresh();
    if (!ok) {
      set({ status: 'anonymous' });
      return;
    }
    try {
      const user = await api<AuthUser>('/users/me');
      const token = getAccessToken();
      if (token) connectSocket(token);
      set({ user, status: 'authenticated' });
    } catch {
      set({ status: 'anonymous' });
    }
  },
}));
