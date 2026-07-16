-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_channel_id_idx" ON "notifications"("user_id", "read_at", "channel_id");
