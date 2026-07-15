-- CreateTable
CREATE TABLE "channel_invites" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channel_invites_token_key" ON "channel_invites"("token");

-- CreateIndex
CREATE INDEX "channel_invites_channel_id_idx" ON "channel_invites"("channel_id");

-- AddForeignKey
ALTER TABLE "channel_invites" ADD CONSTRAINT "channel_invites_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_invites" ADD CONSTRAINT "channel_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
