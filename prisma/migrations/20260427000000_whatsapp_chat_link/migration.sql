-- AlterTable: add WhatsApp link fields to User (idempotent for partially applied DBs)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappPhone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappLinkCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappLinkCodeExpires" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_whatsappPhone_key" ON "User"("whatsappPhone");

-- CreateTable: rolling history for the WhatsApp conversation per user
CREATE TABLE IF NOT EXISTS "WhatsappMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WhatsappMessage_userId_createdAt_idx" ON "WhatsappMessage"("userId", "createdAt");

-- AddForeignKey (skip if already present)
DO $$
BEGIN
  ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
