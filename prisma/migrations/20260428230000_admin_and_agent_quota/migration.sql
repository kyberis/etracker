-- Admin role + per-user daily agent message quota.

-- AlterTable: add admin/active/quota fields to User (idempotent).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dailyAgentMessageLimit" INTEGER NOT NULL DEFAULT 30;

-- Seed: mark the requested account as admin if it exists.
UPDATE "User" SET "isAdmin" = true WHERE LOWER("email") = 'suarez84@gmail.com';

-- CreateTable: shared daily counter for chat-web + WhatsApp agent messages.
CREATE TABLE IF NOT EXISTS "AgentMessageUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentMessageUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AgentMessageUsage_userId_day_key" ON "AgentMessageUsage"("userId", "day");
CREATE INDEX IF NOT EXISTS "AgentMessageUsage_userId_idx" ON "AgentMessageUsage"("userId");

-- AddForeignKey (skip if already present)
DO $$
BEGIN
  ALTER TABLE "AgentMessageUsage" ADD CONSTRAINT "AgentMessageUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
