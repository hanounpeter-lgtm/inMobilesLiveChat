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
  setActiveChannel: (id: string | null) => void;
  setTyping: (channelId: string, users: TypingUser[]) => void;
  setPresence: (userId: string, online: boolean) => void;
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

  setActiveChannel: (id) => set({ activeChannelId: id }),

  setTyping: (channelId, users) =>
    set((s) => ({ typingByChannel: { ...s.typingByChannel, [channelId]: users } })),

  setPresence: (userId, online) =>
    set((s) => {
      const next = new Set(s.onlineUserIds);
      if (online) next.add(userId);
      else next.delete(userId);
      return { onlineUserIds: next };
    }),

}));
