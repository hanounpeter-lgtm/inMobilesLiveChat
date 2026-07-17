-- CreateEnum
CREATE TYPE "ClockKind" AS ENUM ('clock_in', 'break_start', 'break_end', 'clock_out');

-- (Prisma drift artifact removed: content_tsv is a generated column and
--  cannot have its default altered.)

-- CreateTable
CREATE TABLE "work_clock_events" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "kind" "ClockKind" NOT NULL,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_clock_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_clock_events_user_id_at_idx" ON "work_clock_events"("user_id", "at" DESC);

-- AddForeignKey
ALTER TABLE "work_clock_events" ADD CONSTRAINT "work_clock_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
