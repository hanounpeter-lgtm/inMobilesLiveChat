-- CreateEnum
CREATE TYPE "PostingPolicy" AS ENUM ('everyone', 'admins_only');

-- AlterTable
ALTER TABLE "channel_members" ADD COLUMN     "is_starred" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "is_default" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "posting_policy" "PostingPolicy" NOT NULL DEFAULT 'everyone';

-- Backfill: #general is the mandatory default channel; #announcements is admin-post-only
UPDATE "channels" SET "is_default" = true WHERE "name" = 'general' AND "type" = 'public';
UPDATE "channels" SET "posting_policy" = 'admins_only' WHERE "name" = 'announcements';
