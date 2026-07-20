import { z } from 'zod';

// ---------- Auth ----------
export const LoginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const AuthUser = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  statusText: z.string().nullable(),
  role: z.enum(['owner', 'admin', 'member', 'guest']),
});
export type AuthUser = z.infer<typeof AuthUser>;

export const LoginResponse = z.object({
  accessToken: z.string(),
  user: AuthUser,
});
export type LoginResponse = z.infer<typeof LoginResponse>;

export const UpdateProfileRequest = z
  .object({
    displayName: z.string().min(1).max(80).optional(),
    statusText: z.string().max(100).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequest>;

export const UserUpdatedPayload = z.object({
  user: z.object({
    id: z.string().uuid(),
    displayName: z.string(),
    avatarUrl: z.string().nullable(),
    statusText: z.string().nullable(),
  }),
});
export type UserUpdatedPayload = z.infer<typeof UserUpdatedPayload>;

export const RegisterRequest = z.object({
  displayName: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type RegisterRequest = z.infer<typeof RegisterRequest>;

// ---------- Channels ----------
export const ChannelType = z.enum(['public', 'private', 'dm', 'group_dm']);
export type ChannelType = z.infer<typeof ChannelType>;

export const PostingPolicy = z.enum(['everyone', 'admins_only']);
export type PostingPolicy = z.infer<typeof PostingPolicy>;

export const NotifyLevel = z.enum(['all', 'mentions', 'none']);
export type NotifyLevel = z.infer<typeof NotifyLevel>;

export const ChannelSummary = z.object({
  id: z.string().uuid(),
  type: ChannelType,
  name: z.string().nullable(),
  topic: z.string().nullable(),
  description: z.string().nullable(),
  createdById: z.string().uuid().nullable(),
  isArchived: z.boolean(),
  isDefault: z.boolean(),
  postingPolicy: PostingPolicy,
  memberCount: z.number().int(),
  lastMessageAt: z.string().datetime().nullable(),
  // Viewer-scoped fields — never copy these from broadcast payloads.
  notifyLevel: NotifyLevel,
  isStarred: z.boolean(),
  // For DMs/group DMs: the other members, so the client can render a title.
  memberPreviews: z
    .array(
      z.object({
        id: z.string().uuid(),
        displayName: z.string(),
        avatarUrl: z.string().nullable(),
      }),
    )
    .optional(),
});
export type ChannelSummary = z.infer<typeof ChannelSummary>;

const channelName = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-_]*$/i, 'letters, numbers, dashes, underscores');

export const CreateChannelRequest = z.object({
  name: channelName,
  type: z.enum(['public', 'private']),
  topic: z.string().max(250).optional(),
  description: z.string().max(500).optional(),
  memberIds: z.array(z.string().uuid()).max(100).optional(),
});
export type CreateChannelRequest = z.infer<typeof CreateChannelRequest>;

export const UpdateChannelRequest = z
  .object({
    name: channelName.optional(),
    topic: z.string().max(250).nullable().optional(),
    description: z.string().max(500).nullable().optional(),
    type: z.enum(['public', 'private']).optional(),
    postingPolicy: PostingPolicy.optional(),
    isArchived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateChannelRequest = z.infer<typeof UpdateChannelRequest>;

export const AddChannelMembersRequest = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(100),
});
export type AddChannelMembersRequest = z.infer<typeof AddChannelMembersRequest>;

export const MyChannelSettingsRequest = z
  .object({
    notifyLevel: NotifyLevel.optional(),
    isStarred: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type MyChannelSettingsRequest = z.infer<typeof MyChannelSettingsRequest>;

export const ChannelMemberDto = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  workspaceRole: z.enum(['owner', 'admin', 'member', 'guest']),
  joinedAt: z.string().datetime(),
});
export type ChannelMemberDto = z.infer<typeof ChannelMemberDto>;

export const ChannelUpdatedPayload = z.object({ channel: ChannelSummary });
export type ChannelUpdatedPayload = z.infer<typeof ChannelUpdatedPayload>;

export const ChannelMembersJoinedPayload = z.object({
  channelId: z.string().uuid(),
  users: z.array(ChannelMemberDto),
});
export type ChannelMembersJoinedPayload = z.infer<typeof ChannelMembersJoinedPayload>;

export const ChannelMemberLeftPayload = z.object({
  channelId: z.string().uuid(),
  userId: z.string().uuid(),
});
export type ChannelMemberLeftPayload = z.infer<typeof ChannelMemberLeftPayload>;

export const ChannelRemovedPayload = z.object({ channelId: z.string().uuid() });
export type ChannelRemovedPayload = z.infer<typeof ChannelRemovedPayload>;

export const CreateDmRequest = z.object({
  memberIds: z.array(z.string().uuid()).min(1).max(8),
});
export type CreateDmRequest = z.infer<typeof CreateDmRequest>;

// ---------- Messages ----------
export const MessageAuthor = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
});
export type MessageAuthor = z.infer<typeof MessageAuthor>;

// Objective per-emoji membership — clients derive count and "did I react"
// locally, so broadcast payloads are viewer-independent.
export const ReactionGroup = z.object({
  emoji: z.string(),
  userIds: z.array(z.string().uuid()),
});
export type ReactionGroup = z.infer<typeof ReactionGroup>;

export const MessageAttachmentDto = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  isImage: z.boolean(),
});
export type MessageAttachmentDto = z.infer<typeof MessageAttachmentDto>;

export const MessageDto = z.object({
  id: z.string().uuid(),
  channelId: z.string().uuid(),
  parentMessageId: z.string().uuid().nullable(),
  content: z.string(),
  clientMsgId: z.string().uuid(),
  author: MessageAuthor,
  replyCount: z.number().int(),
  isEdited: z.boolean(),
  isDeleted: z.boolean(),
  isPinned: z.boolean(),
  reactions: z.array(ReactionGroup),
  attachments: z.array(MessageAttachmentDto),
  lastReplyAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type MessageDto = z.infer<typeof MessageDto>;

export const ThreadReplyPayload = z.object({
  parentMessageId: z.string().uuid(),
  message: MessageDto,
});
export type ThreadReplyPayload = z.infer<typeof ThreadReplyPayload>;

export const ThreadResponse = z.object({
  parent: MessageDto,
  messages: z.array(MessageDto),
});
export type ThreadResponse = z.infer<typeof ThreadResponse>;

export const ToggleReactionRequest = z.object({
  emoji: z.string().min(1).max(16),
});
export type ToggleReactionRequest = z.infer<typeof ToggleReactionRequest>;

export const SendMessageRequest = z
  .object({
    content: z.string().max(12000),
    clientMsgId: z.string().uuid(),
    parentMessageId: z.string().uuid().optional(),
    attachmentIds: z.array(z.string().uuid()).max(10).optional(),
  })
  .refine(
    (v) => v.content.trim().length > 0 || (v.attachmentIds?.length ?? 0) > 0,
    'Message needs text or attachments',
  );
export type SendMessageRequest = z.infer<typeof SendMessageRequest>;

export const UploadedAttachmentDto = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  isImage: z.boolean(),
});
export type UploadedAttachmentDto = z.infer<typeof UploadedAttachmentDto>;

export const EditMessageRequest = z.object({
  content: z.string().min(1).max(12000),
});
export type EditMessageRequest = z.infer<typeof EditMessageRequest>;

export const MessagePage = z.object({
  messages: z.array(MessageDto),
  // Opaque cursor for the next (older) page; null when exhausted.
  nextCursor: z.string().nullable(),
});
export type MessagePage = z.infer<typeof MessagePage>;

// ---------- Socket payloads ----------
export const MessageNewPayload = z.object({
  message: MessageDto,
});
export type MessageNewPayload = z.infer<typeof MessageNewPayload>;

export const MessageDeletedPayload = z.object({
  messageId: z.string().uuid(),
  channelId: z.string().uuid(),
});
export type MessageDeletedPayload = z.infer<typeof MessageDeletedPayload>;

export const TypingUpdatePayload = z.object({
  channelId: z.string().uuid(),
  users: z.array(z.object({ id: z.string().uuid(), displayName: z.string() })),
});
export type TypingUpdatePayload = z.infer<typeof TypingUpdatePayload>;

export const PresenceUpdatePayload = z.object({
  userId: z.string().uuid(),
  status: z.enum(['online', 'away', 'offline']),
});
export type PresenceUpdatePayload = z.infer<typeof PresenceUpdatePayload>;

// ---------- Channel invites ----------
export const InviteLinkResponse = z.object({
  token: z.string(),
  expiresAt: z.string().datetime(),
});
export type InviteLinkResponse = z.infer<typeof InviteLinkResponse>;

export const InvitePreview = z.object({
  channelId: z.string().uuid(),
  name: z.string().nullable(),
  type: ChannelType,
  topic: z.string().nullable(),
  memberCount: z.number().int(),
  invitedBy: z.string(),
  alreadyMember: z.boolean(),
});
export type InvitePreview = z.infer<typeof InvitePreview>;

// ---------- Time clock ----------
export const ClockStatus = z.enum(['off', 'working', 'break']);
export type ClockStatus = z.infer<typeof ClockStatus>;

export const ClockAction = z.enum(['clock-in', 'break-start', 'break-end', 'clock-out']);
export type ClockAction = z.infer<typeof ClockAction>;

export const TimeclockMe = z.object({
  status: ClockStatus,
  since: z.string().datetime().nullable(),
  workedMsToday: z.number().int(),
  breakMsToday: z.number().int(),
});
export type TimeclockMe = z.infer<typeof TimeclockMe>;

export const TimeclockTeamEntry = z.object({
  userId: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  status: ClockStatus,
  since: z.string().datetime().nullable(),
});
export type TimeclockTeamEntry = z.infer<typeof TimeclockTeamEntry>;

export const TimeclockDayEntry = z.object({
  date: z.string(), // YYYY-MM-DD (UTC day)
  workedMs: z.number().int(),
  breakMs: z.number().int(),
  firstIn: z.string().datetime().nullable(),
  lastOut: z.string().datetime().nullable(),
});
export type TimeclockDayEntry = z.infer<typeof TimeclockDayEntry>;

export const TimeclockHistoryResponse = z.object({
  userId: z.string().uuid(),
  displayName: z.string(),
  entries: z.array(TimeclockDayEntry),
});
export type TimeclockHistoryResponse = z.infer<typeof TimeclockHistoryResponse>;

export const TimeclockUpdatePayload = z.object({
  userId: z.string().uuid(),
  status: ClockStatus,
  since: z.string().datetime().nullable(),
});
export type TimeclockUpdatePayload = z.infer<typeof TimeclockUpdatePayload>;

// ---------- Unreads / notifications ----------
export const UnreadState = z.object({
  channelId: z.string().uuid(),
  lastReadAt: z.string().datetime().nullable(),
  lastReadMessageId: z.string().uuid().nullable(),
  hasUnread: z.boolean(),
  mentionCount: z.number().int(),
});
export type UnreadState = z.infer<typeof UnreadState>;

export const MyUnreadsResponse = z.object({ unreads: z.array(UnreadState) });
export type MyUnreadsResponse = z.infer<typeof MyUnreadsResponse>;

export const MarkReadRequest = z.object({
  messageId: z.string().uuid().optional(),
});
export type MarkReadRequest = z.infer<typeof MarkReadRequest>;

export const NotificationDto = z.object({
  id: z.string().uuid(),
  type: z.enum(['mention', 'dm', 'thread_reply', 'channel_invite']),
  channelId: z.string().uuid().nullable(),
  messageId: z.string().uuid().nullable(),
  actor: MessageAuthor.nullable(),
  snippet: z.string(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type NotificationDto = z.infer<typeof NotificationDto>;

export const NotificationNewPayload = z.object({ notification: NotificationDto });
export type NotificationNewPayload = z.infer<typeof NotificationNewPayload>;

// ---------- Workspace invites / signup ----------
export const CreateWorkspaceInvitesRequest = z.object({
  emails: z.array(z.string().email()).min(1).max(20),
  role: z.enum(['member', 'admin']).default('member'),
});
export type CreateWorkspaceInvitesRequest = z.infer<typeof CreateWorkspaceInvitesRequest>;

export const WorkspaceInviteDto = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['owner', 'admin', 'member', 'guest']),
  token: z.string(),
  invitedBy: z.string(),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type WorkspaceInviteDto = z.infer<typeof WorkspaceInviteDto>;

export const SignupPreview = z.object({
  email: z.string().email(),
  workspaceName: z.string(),
  invitedBy: z.string(),
});
export type SignupPreview = z.infer<typeof SignupPreview>;

export const AcceptSignupRequest = z.object({
  displayName: z.string().min(1).max(80),
  password: z.string().min(8).max(128),
});
export type AcceptSignupRequest = z.infer<typeof AcceptSignupRequest>;

// ---------- Search ----------
export const SearchResultDto = z.object({
  messageId: z.string().uuid(),
  channelId: z.string().uuid(),
  channelName: z.string().nullable(),
  channelType: ChannelType,
  authorDisplayName: z.string(),
  snippet: z.string(), // \x01…\x02 sentinel-delimited highlights
  createdAt: z.string().datetime(),
});
export type SearchResultDto = z.infer<typeof SearchResultDto>;

export const SearchResponse = z.object({ results: z.array(SearchResultDto) });
export type SearchResponse = z.infer<typeof SearchResponse>;

// ---------- GIFs ----------
export const GifDto = z.object({
  id: z.string(),
  url: z.string(),
  preview: z.string(),
  width: z.number(),
  height: z.number(),
});
export type GifDto = z.infer<typeof GifDto>;

// ---------- Files ----------
export const FileUrlResponse = z.object({
  url: z.string(),
});
export type FileUrlResponse = z.infer<typeof FileUrlResponse>;

// ---------- Calls ----------
export const CallDto = z.object({
  id: z.string().uuid(),
  channelId: z.string().uuid(),
  type: z.enum(['audio', 'video']),
  startedBy: z.object({ id: z.string().uuid(), displayName: z.string() }),
  startedAt: z.string().datetime(),
  isRecording: z.boolean(),
});

export const CallRecordingPayload = z.object({
  callId: z.string().uuid(),
  channelId: z.string().uuid(),
  isRecording: z.boolean(),
  by: z.string(),
});
export type CallRecordingPayload = z.infer<typeof CallRecordingPayload>;
export type CallDto = z.infer<typeof CallDto>;

export const StartCallRequest = z.object({
  type: z.enum(['audio', 'video']),
});
export type StartCallRequest = z.infer<typeof StartCallRequest>;

export const JoinCallResponse = z.object({
  call: CallDto,
  token: z.string(),
  serverUrl: z.string(),
});
export type JoinCallResponse = z.infer<typeof JoinCallResponse>;

export const CallStartedPayload = z.object({
  call: CallDto,
});
export type CallStartedPayload = z.infer<typeof CallStartedPayload>;

export const CallEndedPayload = z.object({
  callId: z.string().uuid(),
  channelId: z.string().uuid(),
});
export type CallEndedPayload = z.infer<typeof CallEndedPayload>;

export const RoomJoinPayload = z.object({
  channelId: z.string().uuid(),
});
export type RoomJoinPayload = z.infer<typeof RoomJoinPayload>;

export const TypingPayload = z.object({
  channelId: z.string().uuid(),
});
export type TypingPayload = z.infer<typeof TypingPayload>;
