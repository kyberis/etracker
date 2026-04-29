-- Internal admin analytics: lastSeenAt + DailyActiveUser (DAU/WAU/MAU)
-- and AgentDailyModelUsage for per-model AI usage breakdown.

-- AlterTable: add lastSeenAt to User (idempotent).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);

-- CreateTable: one row per (user, UTC day) when user is seen active.
CREATE TABLE IF NOT EXISTS "DailyActiveUser" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyActiveUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DailyActiveUser_userId_day_key" ON "DailyActiveUser"("userId", "day");
CREATE INDEX IF NOT EXISTS "DailyActiveUser_day_idx" ON "DailyActiveUser"("day");

DO $$
BEGIN
  ALTER TABLE "DailyActiveUser" ADD CONSTRAINT "DailyActiveUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: per-model agent usage aggregate.
CREATE TABLE IF NOT EXISTS "AgentDailyModelUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "model" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentDailyModelUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgentDailyModelUsage_userId_day_model_key" ON "AgentDailyModelUsage"("userId", "day", "model");
CREATE INDEX IF NOT EXISTS "AgentDailyModelUsage_day_idx" ON "AgentDailyModelUsage"("day");
CREATE INDEX IF NOT EXISTS "AgentDailyModelUsage_model_idx" ON "AgentDailyModelUsage"("model");

DO $$
BEGIN
  ALTER TABLE "AgentDailyModelUsage" ADD CONSTRAINT "AgentDailyModelUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
