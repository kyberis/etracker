-- AlterTable: add Telegram link fields to User. Idempotent so the migration
-- replays cleanly on environments that may have run a partial copy.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramUserId" BIGINT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramUsername" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramChatId" BIGINT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramVerifiedAt" TIMESTAMP(3);

-- CreateIndex: telegramUserId is the stable identity we look up on every
-- inbound update; making it unique also guards against double-linking.
CREATE UNIQUE INDEX IF NOT EXISTS "User_telegramUserId_key" ON "User"("telegramUserId");

-- CreateTable: rolling history for the Telegram conversation per user.
-- Mirrors WhatsappMessage but keeps `chatId`/`isGroup` so we don't have to
-- migrate the table when group support lands.
CREATE TABLE IF NOT EXISTS "TelegramMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "telegramMessageId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TelegramMessage_userId_createdAt_idx" ON "TelegramMessage"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "TelegramMessage_chatId_idx" ON "TelegramMessage"("chatId");

-- AddForeignKey (skip if already present)
DO $$
BEGIN
  ALTER TABLE "TelegramMessage" ADD CONSTRAINT "TelegramMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
