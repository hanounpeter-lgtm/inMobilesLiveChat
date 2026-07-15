-- CreateEnum
CREATE TYPE "CallType" AS ENUM ('audio', 'video');

-- CreateTable
CREATE TABLE "calls" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "started_by" UUID NOT NULL,
    "livekit_room" TEXT NOT NULL,
    "type" "CallType" NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calls_livekit_room_key" ON "calls"("livekit_room");

-- CreateIndex
CREATE INDEX "calls_channel_id_ended_at_idx" ON "calls"("channel_id", "ended_at");

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
