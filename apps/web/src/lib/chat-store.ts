import { create } from 'zustand';
import type { JoinCallResponse } from '@inmobiles/shared-types';

interface TypingUser {
  id: string;
  displayName: string;
}

interface ChatState {
  activeChannelId: string | null;
  currentCall: JoinCallResponse | null;
  setCurrentCall: (call: JoinCallResponse | null) => void;
  detailsPanelOpen: boolean;
  setDetailsPanel: (open: boolean) => void;
  /** Text queued for insertion into the composer (e.g. quote reply). */
  composerInsert: string | null;
  setComposerInsert: (text: string | null) => void;
  typingByChannel: Record<string, TypingUser[]>;
  onlineUserIds: Set<string>;
  lastSeenByChannel: Record<string, string>; // channelId -> ISO timestamp
  setActiveChannel: (id: string | null) => void;
  setTyping: (channelId: string, users: TypingUser[]) => void;
  setPresence: (userId: string, online: boolean) => void;
  markSeen: (channelId: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  activeChannelId: null,
  currentCall: null,
  setCurrentCall: (call) => set({ currentCall: call }),
  detailsPanelOpen: false,
  setDetailsPanel: (open) => set({ detailsPanelOpen: open }),
  composerInsert: null,
  setComposerInsert: (text) => set({ composerInsert: text }),
  typingByChannel: {},
  onlineUserIds: new Set(),
  lastSeenByChannel: {},

  setActiveChannel: (id) =>
    set((s) => ({
      activeChannelId: id,
      lastSeenByChannel: id
        ? { ...s.lastSeenByChannel, [id]: new Date().toISOString() }
        : s.lastSeenByChannel,
    })),

  setTyping: (channelId, users) =>
    set((s) => ({ typingByChannel: { ...s.typingByChannel, [channelId]: users } })),

  setPresence: (userId, online) =>
    set((s) => {
      const next = new Set(s.onlineUserIds);
      if (online) next.add(userId);
      else next.delete(userId);
      return { onlineUserIds: next };
    }),

  markSeen: (channelId) =>
    set((s) => ({
      lastSeenByChannel: { ...s.lastSeenByChannel, [channelId]: new Date().toISOString() },
    })),
}));
