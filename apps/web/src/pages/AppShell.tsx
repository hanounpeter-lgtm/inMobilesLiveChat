import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CallEndedPayload,
  CallRingPayload,
  CallRingStopPayload,
  CallStartedPayload,
  ChannelReadPayload,
  ChannelRemovedPayload,
  MeetingScheduledPayload,
  MeetingCancelledPayload,
  ReadReceiptDto,
  ChannelSummary,
  ChannelUpdatedPayload,
  MessageDeletedPayload,
  MessageNewPayload,
  PresenceUpdatePayload,
  ServerEvents,
  ClientEvents,
  ThreadReplyPayload,
  TypingUpdatePayload,
  UnreadState,
} from '@inmobiles/shared-types';
import { useAuth } from '../lib/auth-store';
import { applyUnreadUpdate, bumpLocalUnread, unreadsKey, useUnreads } from '../lib/unreads';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useChatStore } from '../lib/chat-store';
import {
  upsertMessage,
  removeMessage,
  upsertThreadReply,
  bumpReplyCount,
  patchThreadMessage,
  markThreadMessageDeleted,
} from '../lib/message-cache';
import {
  ensureNotificationPermission,
  showDesktopNotification,
  setTabBadge,
} from '../lib/desktop-notify';
import type { NotificationNewPayload } from '@inmobiles/shared-types';
import Sidebar from '../features/Sidebar';
import MessagePane from '../features/MessagePane';
import CallOverlay from '../features/CallOverlay';
import ChannelDetailsPanel from '../features/ChannelDetailsPanel';
import ThreadPanel from '../features/ThreadPanel';
import ForwardModal from '../features/ForwardModal';
import IncomingCallModal from '../features/IncomingCallModal';
import HomeDashboard from '../features/HomeDashboard';

export default function AppShell() {
  const queryClient = useQueryClient();
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const setTyping = useChatStore((s) => s.setTyping);
  const setPresence = useChatStore((s) => s.setPresence);
  const user = useAuth((s) => s.user);
  useUnreads(); // warm the ['unreads'] cache early

  const channelsQuery = useQuery({
    queryKey: ['channels'],
    queryFn: () => api<{ channels: ChannelSummary[] }>('/channels'),
  });
  const channels = channelsQuery.data?.channels ?? [];

  // Default to the workspace's default channel (or the first) once loaded.
  useEffect(() => {
    if (!activeChannelId && channels.length > 0) {
      const fallback = channels.find((c) => c.isDefault) ?? channels[0];
      setActiveChannel(fallback.id);
    }
  }, [activeChannelId, channels, setActiveChannel]);

  // Join socket rooms for every channel in the sidebar (server re-authorizes
  // each join). Re-runs on reconnect so rooms survive network blips.
  useEffect(() => {
    const socket = getSocket();
    if (!socket || channels.length === 0) return;
    const joinAll = () => {
      for (const c of channels) socket.emit(ClientEvents.RoomJoin, { channelId: c.id });
    };
    joinAll();
    socket.on('connect', joinAll);
    return () => {
      socket.off('connect', joinAll);
    };
  }, [channels]);

  // Wire server events into the query cache / chat store.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onMessageNew = ({ message }: MessageNewPayload) => {
      upsertMessage(queryClient, message);
      queryClient.setQueryData<{ channels: ChannelSummary[] }>(['channels'], (data) =>
        data
          ? {
              channels: data.channels.map((c) =>
                c.id === message.channelId ? { ...c, lastMessageAt: message.createdAt } : c,
              ),
            }
          : data,
      );
      // Bold the channel locally unless it's mine or the active, focused channel.
      const isActive =
        message.channelId === useChatStore.getState().activeChannelId && document.hasFocus();
      if (message.author.id !== user?.id && !isActive) {
        bumpLocalUnread(queryClient, message.channelId);
      }
    };
    const onMessageUpdated = ({ message }: MessageNewPayload) => {
      upsertMessage(queryClient, message);
      patchThreadMessage(queryClient, message);
      queryClient.invalidateQueries({ queryKey: ['pins', message.channelId] });
    };
    const onMessageDeleted = ({ messageId, channelId }: MessageDeletedPayload) => {
      removeMessage(queryClient, channelId, messageId);
      markThreadMessageDeleted(queryClient, messageId);
      queryClient.invalidateQueries({ queryKey: ['pins', channelId] });
    };
    const onThreadReply = ({ parentMessageId, message }: ThreadReplyPayload) => {
      upsertThreadReply(queryClient, parentMessageId, message);
      bumpReplyCount(queryClient, message.channelId, parentMessageId, message.createdAt);
      // Hook point: thread-follow notifications land here in a later phase.
    };
    const onTyping = ({ channelId, users }: TypingUpdatePayload) => setTyping(channelId, users);
    const onPresence = ({ userId, status }: PresenceUpdatePayload) =>
      setPresence(userId, status === 'online');
    const onChannelCreated = () => queryClient.invalidateQueries({ queryKey: ['channels'] });
    // Patch shared fields only — broadcast payloads carry the EMITTER's
    // per-viewer fields (isStarred/notifyLevel), which must not overwrite ours.
    // My-settings echoes arrive via the user room; invalidation covers those.
    const onChannelUpdated = ({ channel }: ChannelUpdatedPayload) => {
      queryClient.setQueryData<{ channels: ChannelSummary[] }>(['channels'], (data) => {
        if (!data) return data;
        if (!data.channels.some((c) => c.id === channel.id)) return data;
        return {
          channels: data.channels.map((c) =>
            c.id === channel.id
              ? {
                  ...c,
                  name: channel.name,
                  topic: channel.topic,
                  description: channel.description,
                  type: channel.type,
                  isArchived: channel.isArchived,
                  postingPolicy: channel.postingPolicy,
                  memberCount: channel.memberCount,
                }
              : c,
          ),
        };
      });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    };
    const onChannelRemoved = ({ channelId }: ChannelRemovedPayload) => {
      queryClient.setQueryData<{ channels: ChannelSummary[] }>(['channels'], (data) =>
        data ? { channels: data.channels.filter((c) => c.id !== channelId) } : data,
      );
      queryClient.removeQueries({ queryKey: ['channel-members', channelId] });
      if (useChatStore.getState().activeChannelId === channelId) {
        const list =
          queryClient.getQueryData<{ channels: ChannelSummary[] }>(['channels'])?.channels ?? [];
        const fallback = list.find((c) => c.isDefault) ?? list[0] ?? null;
        setActiveChannel(fallback?.id ?? null);
      }
    };
    const onMembersChanged = (payload: { channelId: string }) => {
      queryClient.invalidateQueries({ queryKey: ['channel-members', payload.channelId] });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    };
    const onInviteChanged = () =>
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
    const onCallStarted = ({ call }: CallStartedPayload) =>
      queryClient.setQueryData(['call', call.channelId], { call });
    const onCallEnded = ({ channelId }: CallEndedPayload) => {
      queryClient.setQueryData(['call', channelId], { call: null });
      const ring = useChatStore.getState().incomingCall;
      if (ring?.channelId === channelId) useChatStore.getState().setIncomingCall(null);
    };
    const onCallRing = (ring: CallRingPayload) => {
      // Don't ring yourself, and never ring while already in a call.
      if (ring.from.id === user?.id || useChatStore.getState().currentCall) return;
      useChatStore.getState().setIncomingCall(ring);
    };
    const onCallRingStop = ({ callId }: CallRingStopPayload) => {
      const ring = useChatStore.getState().incomingCall;
      if (ring?.callId === callId) useChatStore.getState().setIncomingCall(null);
    };
    const onMeetingChanged = (_p: MeetingScheduledPayload | MeetingCancelledPayload) => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    };
    const onUnreadUpdate = (state: UnreadState) => applyUnreadUpdate(queryClient, state);
    const onChannelRead = ({ channelId, userId, lastReadMessageId, lastReadAt }: ChannelReadPayload) => {
      queryClient.setQueryData<{ receipts: ReadReceiptDto[] }>(['reads', channelId], (data) => {
        if (!data) return data;
        const others = data.receipts.filter((r) => r.userId !== userId);
        const prev = data.receipts.find((r) => r.userId === userId);
        return {
          receipts: [
            ...others,
            {
              userId,
              displayName: prev?.displayName ?? '',
              avatarUrl: prev?.avatarUrl ?? null,
              lastReadMessageId,
              lastReadAt,
            },
          ],
        };
      });
    };
    const onTimeclockUpdate = () =>
      queryClient.invalidateQueries({ queryKey: ['timeclock'] });
    const onUserUpdated = () => {
      // Names/avatars are denormalized into many caches — refetch them.
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['channel-members'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['thread'] });
    };
    const onNotificationNew = ({ notification }: NotificationNewPayload) => {
      queryClient.invalidateQueries({ queryKey: ['activity'] });
      const who = notification.actor?.displayName ?? 'Someone';
      const title = notification.type === 'mention' ? `${who} mentioned you` : `Message from ${who}`;
      showDesktopNotification(title, notification.snippet || '', () =>
        setActiveChannel(notification.channelId),
      );
    };
    const onCallRecording = (payload: { channelId: string; isRecording: boolean }) =>
      queryClient.setQueryData<{ call: { isRecording: boolean } | null }>(
        ['call', payload.channelId],
        (data) =>
          data?.call ? { call: { ...data.call, isRecording: payload.isRecording } } : data,
      );

    socket.on(ServerEvents.MessageNew, onMessageNew);
    socket.on(ServerEvents.MessageUpdated, onMessageUpdated);
    socket.on(ServerEvents.MessageDeleted, onMessageDeleted);
    socket.on(ServerEvents.ThreadReply, onThreadReply);
    socket.on(ServerEvents.TypingUpdate, onTyping);
    socket.on(ServerEvents.PresenceUpdate, onPresence);
    socket.on(ServerEvents.ChannelCreated, onChannelCreated);
    socket.on(ServerEvents.ChannelUpdated, onChannelUpdated);
    socket.on(ServerEvents.ChannelRemoved, onChannelRemoved);
    socket.on(ServerEvents.ChannelMemberJoined, onMembersChanged);
    socket.on(ServerEvents.ChannelMemberLeft, onMembersChanged);
    socket.on(ServerEvents.ChannelInviteReceived, onInviteChanged);
    socket.on(ServerEvents.ChannelInviteResolved, onInviteChanged);
    socket.on(ServerEvents.CallStarted, onCallStarted);
    socket.on(ServerEvents.CallEnded, onCallEnded);
    socket.on(ServerEvents.CallRecording, onCallRecording);
    socket.on(ServerEvents.CallRing, onCallRing);
    socket.on(ServerEvents.CallRingStop, onCallRingStop);
    socket.on(ServerEvents.MeetingScheduled, onMeetingChanged);
    socket.on(ServerEvents.MeetingCancelled, onMeetingChanged);
    socket.on(ServerEvents.UnreadUpdate, onUnreadUpdate);
    socket.on(ServerEvents.ChannelRead, onChannelRead);
    socket.on(ServerEvents.UserUpdated, onUserUpdated);
    socket.on(ServerEvents.TimeclockUpdate, onTimeclockUpdate);
    socket.on(ServerEvents.NotificationNew, onNotificationNew);

    // Reconnect recovery: REST is the source of truth.
    const onReconnect = () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: unreadsKey });
      queryClient.invalidateQueries({ queryKey: ['thread'] });
    };
    socket.io.on('reconnect', onReconnect);

    return () => {
      socket.off(ServerEvents.MessageNew, onMessageNew);
      socket.off(ServerEvents.MessageUpdated, onMessageUpdated);
      socket.off(ServerEvents.MessageDeleted, onMessageDeleted);
      socket.off(ServerEvents.ThreadReply, onThreadReply);
      socket.off(ServerEvents.TypingUpdate, onTyping);
      socket.off(ServerEvents.PresenceUpdate, onPresence);
      socket.off(ServerEvents.ChannelCreated, onChannelCreated);
      socket.off(ServerEvents.ChannelUpdated, onChannelUpdated);
      socket.off(ServerEvents.ChannelRemoved, onChannelRemoved);
      socket.off(ServerEvents.ChannelMemberJoined, onMembersChanged);
      socket.off(ServerEvents.ChannelMemberLeft, onMembersChanged);
      socket.off(ServerEvents.ChannelInviteReceived, onInviteChanged);
      socket.off(ServerEvents.ChannelInviteResolved, onInviteChanged);
      socket.off(ServerEvents.CallStarted, onCallStarted);
      socket.off(ServerEvents.CallEnded, onCallEnded);
      socket.off(ServerEvents.CallRecording, onCallRecording);
      socket.off(ServerEvents.CallRing, onCallRing);
      socket.off(ServerEvents.CallRingStop, onCallRingStop);
      socket.off(ServerEvents.MeetingScheduled, onMeetingChanged);
      socket.off(ServerEvents.MeetingCancelled, onMeetingChanged);
      socket.off(ServerEvents.UnreadUpdate, onUnreadUpdate);
      socket.off(ServerEvents.ChannelRead, onChannelRead);
      socket.off(ServerEvents.UserUpdated, onUserUpdated);
      socket.off(ServerEvents.TimeclockUpdate, onTimeclockUpdate);
      socket.off(ServerEvents.NotificationNew, onNotificationNew);
      socket.io.off('reconnect', onReconnect);
    };
  }, [queryClient, setTyping, setPresence, setActiveChannel, user?.id]);

  // Ask for desktop-notification permission once, after sign-in.
  useEffect(() => {
    ensureNotificationPermission();
  }, []);

  // Reflect unread mentions/DMs in the browser tab title.
  const { unreads } = useUnreads();
  const totalMentions = Object.values(unreads).reduce((sum, u) => sum + u.mentionCount, 0);
  useEffect(() => {
    setTabBadge(totalMentions);
  }, [totalMentions]);

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;
  const currentCall = useChatStore((s) => s.currentCall);
  const detailsPanelOpen = useChatStore((s) => s.detailsPanelOpen);
  const threadOpenFor = useChatStore((s) => s.threadOpenFor);
  const forwardMessage = useChatStore((s) => s.forwardMessage);
  const incomingCall = useChatStore((s) => s.incomingCall);
  const showHome = useChatStore((s) => s.showHome);

  return (
    <div className="app-shell">
      <Sidebar channels={channels} />
      {showHome ? (
        <HomeDashboard channels={channels} />
      ) : activeChannel ? (
        <MessagePane key={activeChannel.id} channel={activeChannel} />
      ) : (
        <div className="fullscreen-center muted">
          {channelsQuery.isLoading ? 'Loading channels…' : 'Select a channel'}
        </div>
      )}
      {threadOpenFor && activeChannel && (
        <ThreadPanel key={threadOpenFor} parentId={threadOpenFor} channel={activeChannel} />
      )}
      {detailsPanelOpen && !threadOpenFor && activeChannel && (
        <ChannelDetailsPanel channel={activeChannel} />
      )}
      {currentCall && <CallOverlay key={currentCall.call.id} join={currentCall} />}
      {forwardMessage && <ForwardModal message={forwardMessage} />}
      {incomingCall && !currentCall && <IncomingCallModal ring={incomingCall} />}
    </div>
  );
}
