-- Scheduled meetings: join code
ALTER TABLE "scheduled_meetings" ADD COLUMN "join_code" TEXT;
CREATE UNIQUE INDEX "scheduled_meetings_join_code_key" ON "scheduled_meetings"("join_code");

-- Polls
CREATE TABLE "polls" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "multiple" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "polls_message_id_key" ON "polls"("message_id");

CREATE TABLE "poll_options" (
    "id" UUID NOT NULL,
    "poll_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "poll_options_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "poll_options_poll_id_idx" ON "poll_options"("poll_id");

CREATE TABLE "poll_votes" (
    "option_id" UUID NOT NULL,
    "poll_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("option_id","user_id")
);
CREATE INDEX "poll_votes_poll_id_idx" ON "poll_votes"("poll_id");

ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tasks
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "channel_id" UUID,
    "creator_id" UUID NOT NULL,
    "assignee_id" UUID,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "due_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tasks_channel_id_idx" ON "tasks"("channel_id");
CREATE INDEX "tasks_assignee_id_done_idx" ON "tasks"("assignee_id","done");
CREATE INDEX "tasks_creator_id_done_idx" ON "tasks"("creator_id","done");

-- Channel notes (one per channel)
CREATE TABLE "channel_notes" (
    "channel_id" UUID NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "channel_notes_pkey" PRIMARY KEY ("channel_id")
);

-- Message templates
CREATE TABLE "message_templates" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "message_templates_workspace_id_idx" ON "message_templates"("workspace_id");

-- Calendar events + attendees
CREATE TABLE "calendar_events" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start_at" TIMESTAMPTZ NOT NULL,
    "end_at" TIMESTAMPTZ,
    "channel_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "calendar_events_workspace_id_start_at_idx" ON "calendar_events"("workspace_id","start_at");

CREATE TABLE "event_attendees" (
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    CONSTRAINT "event_attendees_pkey" PRIMARY KEY ("event_id","user_id")
);
CREATE INDEX "event_attendees_user_id_idx" ON "event_attendees"("user_id");
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
