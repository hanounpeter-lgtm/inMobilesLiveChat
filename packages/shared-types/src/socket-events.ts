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
  ChannelRead: 'channel:read',
  NotificationNew: 'notification:new',
  ChannelCreated: 'channel:created',
  ChannelUpdated: 'channel:updated',
  ChannelMemberJoined: 'channel:member_joined',
  ChannelMemberLeft: 'channel:member_left',
  ChannelRemoved: 'channel:removed',
  ChannelInviteReceived: 'channel:invite_received',
  ChannelInviteResolved: 'channel:invite_resolved',
  UserUpdated: 'user:updated',
  TimeclockUpdate: 'timeclock:update',
  CallStarted: 'call:started',
  CallEnded: 'call:ended',
  CallRecording: 'call:recording',
  CallRing: 'call:ring',
  CallRingStop: 'call:ring_stop',
  ScreenshareGranted: 'call:screenshare_granted',
  MeetingScheduled: 'meeting:scheduled',
  MeetingCancelled: 'meeting:cancelled',
  PollUpdate: 'poll:update',
  TaskUpdate: 'task:update',
  NoteUpdate: 'note:update',
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
