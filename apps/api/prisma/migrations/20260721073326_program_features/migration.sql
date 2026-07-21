-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "forwarded_from_id" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "department" TEXT,
ADD COLUMN     "job_title" TEXT;

-- CreateTable
CREATE TABLE "saved_messages" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_meetings" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "CallType" NOT NULL DEFAULT 'video',
    "scheduled_at" TIMESTAMPTZ NOT NULL,
    "reminded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_messages_user_id_created_at_idx" ON "saved_messages"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "saved_messages_user_id_message_id_key" ON "saved_messages"("user_id", "message_id");

-- CreateIndex
CREATE INDEX "scheduled_meetings_channel_id_scheduled_at_idx" ON "scheduled_meetings"("channel_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "scheduled_meetings_scheduled_at_reminded_idx" ON "scheduled_meetings"("scheduled_at", "reminded");

-- AddForeignKey
ALTER TABLE "saved_messages" ADD CONSTRAINT "saved_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_messages" ADD CONSTRAINT "saved_messages_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_meetings" ADD CONSTRAINT "scheduled_meetings_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_meetings" ADD CONSTRAINT "scheduled_meetings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_forwarded_from_id_fkey" FOREIGN KEY ("forwarded_from_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
