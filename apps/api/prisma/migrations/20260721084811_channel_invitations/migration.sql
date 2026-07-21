-- CreateTable
CREATE TABLE "channel_invitations" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "inviter_id" UUID NOT NULL,
    "invitee_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "channel_invitations_invitee_id_created_at_idx" ON "channel_invitations"("invitee_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "channel_invitations_channel_id_invitee_id_key" ON "channel_invitations"("channel_id", "invitee_id");

-- AddForeignKey
ALTER TABLE "channel_invitations" ADD CONSTRAINT "channel_invitations_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_invitations" ADD CONSTRAINT "channel_invitations_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_invitations" ADD CONSTRAINT "channel_invitations_invitee_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
