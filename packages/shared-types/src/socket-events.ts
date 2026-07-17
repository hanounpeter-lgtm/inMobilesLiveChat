// The realtime protocol contract. Every event name and payload shape used by
// both apps/api and apps/web lives here — never inline event strings elsewhere.

export const ServerEvents = {
  MessageNew: 'message:new',
  MessageUpdated: 'message:updated',
  MessageDeleted: 'message:deleted',
  ThreadReply: 'thread:reply',
  ReactionAdded: 'reaction:added',
  ReactionRemoved: 'reaction:removed',
  TypingUpdate: 'typing:update',
  PresenceUpdate: 'presence:update',
  UnreadUpdate: 'unread:update',
  NotificationNew: 'notification:new',
  ChannelCreated: 'channel:created',
  ChannelUpdated: 'channel:updated',
  ChannelMemberJoined: 'channel:member_joined',
  ChannelMemberLeft: 'channel:member_left',
  ChannelRemoved: 'channel:removed',
  UserUpdated: 'user:updated',
  TimeclockUpdate: 'timeclock:update',
  CallStarted: 'call:started',
  CallEnded: 'call:ended',
  CallRecording: 'call:recording',
} as const;

export const ClientEvents = {
  RoomJoin: 'room:join',
  RoomLeave: 'room:leave',
  TypingStart: 'typing:start',
  TypingStop: 'typing:stop',
} as const;

export type ServerEventName = (typeof ServerEvents)[keyof typeof ServerEvents];
export type ClientEventName = (typeof ClientEvents)[keyof typeof ClientEvents];

export const rooms = {
  user: (userId: string) => `user:${userId}`,
  channel: (channelId: string) => `channel:${channelId}`,
  workspace: (workspaceId: string) => `workspace:${workspaceId}`,
};
