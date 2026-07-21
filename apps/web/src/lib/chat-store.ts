import { create } from 'zustand';
import type { JoinCallResponse, MessageDto } from '@inmobiles/shared-types';

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
  /** Parent message id of the open thread panel (exclusive with details). */
  threadOpenFor: string | null;
  openThread: (messageId: string) => void;
  closeThread: () => void;
  /** Text queued for insertion into the composer (e.g. quote reply). */
  composerInsert: string | null;
  setComposerInsert: (text: string | null) => void;
  /** Files dropped onto the message pane, consumed by the composer. */
  composerFiles: File[] | null;
  setComposerFiles: (files: File[] | null) => void;
  /** Message queued for forwarding — AppShell renders the picker when set. */
  forwardMessage: MessageDto | null;
  setForwardMessage: (message: MessageDto | null) => void;
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
  setDetailsPanel: (open) => set(open ? { detailsPanelOpen: true, threadOpenFor: null } : { detailsPanelOpen: false }),
  threadOpenFor: null,
  openThread: (messageId) => set({ threadOpenFor: messageId, detailsPanelOpen: false }),
  closeThread: () => set({ threadOpenFor: null }),
  composerInsert: null,
  setComposerInsert: (text) => set({ composerInsert: text }),
  composerFiles: null,
  setComposerFiles: (files) => set({ composerFiles: files }),
  forwardMessage: null,
  setForwardMessage: (message) => set({ forwardMessage: message }),
  typingByChannel: {},
  onlineUserIds: new Set(),

  setActiveChannel: (id) => set({ activeChannelId: id, threadOpenFor: null }),

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
