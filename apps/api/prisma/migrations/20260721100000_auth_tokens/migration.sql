ALTER TABLE "users" ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "verify_token" TEXT;
ALTER TABLE "users" ADD COLUMN "reset_token" TEXT;
ALTER TABLE "users" ADD COLUMN "reset_token_expiry" TIMESTAMPTZ;
CREATE UNIQUE INDEX "users_verify_token_key" ON "users"("verify_token");
CREATE UNIQUE INDEX "users_reset_token_key" ON "users"("reset_token");
