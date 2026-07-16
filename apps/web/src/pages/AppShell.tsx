import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CallEndedPayload,
  CallStartedPayload,
  ChannelRemovedPayload,
  ChannelSummary,
  ChannelUpdatedPayload,
  MessageDeletedPayload,
  MessageNewPayload,
  PresenceUpdatePayload,
  ServerEvents,
  ClientEvents,
  TypingUpdatePayload,
} from '@inmobiles/shared-types';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useChatStore } from '../lib/chat-store';
import { upsertMessage, removeMessage } from '../lib/message-cache';
import Sidebar from '../features/Sidebar';
import MessagePane from '../features/MessagePane';
import CallOverlay from '../features/CallOverlay';
import ChannelDetailsPanel from '../features/ChannelDetailsPanel';

export default function AppShell() {
  const queryClient = useQueryClient();
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const setTyping = useChatStore((s) => s.setTyping);
  const setPresence = useChatStore((s) => s.setPresence);
  const markSeen = useChatStore((s) => s.markSeen);

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
      if (message.channelId === useChatStore.getState().activeChannelId) {
        markSeen(message.channelId);
      }
    };
    const onMessageUpdated = ({ message }: MessageNewPayload) => {
      upsertMessage(queryClient, message);
      queryClient.invalidateQueries({ queryKey: ['pins', message.channelId] });
    };
    const onMessageDeleted = ({ messageId, channelId }: MessageDeletedPayload) => {
      removeMessage(queryClient, channelId, messageId);
      queryClient.invalidateQueries({ queryKey: ['pins', channelId] });
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
    const onCallStarted = ({ call }: CallStartedPayload) =>
      queryClient.setQueryData(['call', call.channelId], { call });
    const onCallEnded = ({ channelId }: CallEndedPayload) =>
      queryClient.setQueryData(['call', channelId], { call: null });
    const onCallRecording = (payload: { channelId: string; isRecording: boolean }) =>
      queryClient.setQueryData<{ call: { isRecording: boolean } | null }>(
        ['call', payload.channelId],
        (data) =>
          data?.call ? { call: { ...data.call, isRecording: payload.isRecording } } : data,
      );

    socket.on(ServerEvents.MessageNew, onMessageNew);
    socket.on(ServerEvents.MessageUpdated, onMessageUpdated);
    socket.on(ServerEvents.MessageDeleted, onMessageDeleted);
    socket.on(ServerEvents.TypingUpdate, onTyping);
    socket.on(ServerEvents.PresenceUpdate, onPresence);
    socket.on(ServerEvents.ChannelCreated, onChannelCreated);
    socket.on(ServerEvents.ChannelUpdated, onChannelUpdated);
    socket.on(ServerEvents.ChannelRemoved, onChannelRemoved);
    socket.on(ServerEvents.ChannelMemberJoined, onMembersChanged);
    socket.on(ServerEvents.ChannelMemberLeft, onMembersChanged);
    socket.on(ServerEvents.CallStarted, onCallStarted);
    socket.on(ServerEvents.CallEnded, onCallEnded);
    socket.on(ServerEvents.CallRecording, onCallRecording);

    // Reconnect recovery: REST is the source of truth.
    const onReconnect = () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    };
    socket.io.on('reconnect', onReconnect);

    return () => {
      socket.off(ServerEvents.MessageNew, onMessageNew);
      socket.off(ServerEvents.MessageUpdated, onMessageUpdated);
      socket.off(ServerEvents.MessageDeleted, onMessageDeleted);
      socket.off(ServerEvents.TypingUpdate, onTyping);
      socket.off(ServerEvents.PresenceUpdate, onPresence);
      socket.off(ServerEvents.ChannelCreated, onChannelCreated);
      socket.off(ServerEvents.ChannelUpdated, onChannelUpdated);
      socket.off(ServerEvents.ChannelRemoved, onChannelRemoved);
      socket.off(ServerEvents.ChannelMemberJoined, onMembersChanged);
      socket.off(ServerEvents.ChannelMemberLeft, onMembersChanged);
      socket.off(ServerEvents.CallStarted, onCallStarted);
      socket.off(ServerEvents.CallEnded, onCallEnded);
      socket.off(ServerEvents.CallRecording, onCallRecording);
      socket.io.off('reconnect', onReconnect);
    };
  }, [queryClient, setTyping, setPresence, markSeen]);

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;
  const currentCall = useChatStore((s) => s.currentCall);
  const detailsPanelOpen = useChatStore((s) => s.detailsPanelOpen);

  return (
    <div className="app-shell">
      <Sidebar channels={channels} />
      {activeChannel ? (
        <MessagePane key={activeChannel.id} channel={activeChannel} />
      ) : (
        <div className="fullscreen-center muted">
          {channelsQuery.isLoading ? 'Loading channels…' : 'Select a channel'}
        </div>
      )}
      {detailsPanelOpen && activeChannel && <ChannelDetailsPanel channel={activeChannel} />}
      {currentCall && <CallOverlay key={currentCall.call.id} join={currentCall} />}
    </div>
  );
}
