-- Short-lived DB-backed link codes for Telegram deep links (t.me/?start=).
-- Telegram's `start` parameter is max 64 chars; long HMAC tokens were truncated.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramLinkCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramLinkCodeExpires" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "User_telegramLinkCode_key" ON "User"("telegramLinkCode");
