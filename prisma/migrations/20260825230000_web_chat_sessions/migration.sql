-- Web chat sessions: bounded visits with optional end-of-session summary.

CREATE TABLE IF NOT EXISTS "WebChatSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "summary" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebChatSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WebChatSession_userId_endedAt_idx" ON "WebChatSession"("userId", "endedAt");
CREATE INDEX IF NOT EXISTS "WebChatSession_userId_lastActivityAt_idx" ON "WebChatSession"("userId", "lastActivityAt");

DO $$
BEGIN
  ALTER TABLE "WebChatSession" ADD CONSTRAINT "WebChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "WebChatMessage" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;
CREATE INDEX IF NOT EXISTS "WebChatMessage_sessionId_createdAt_idx" ON "WebChatMessage"("sessionId", "createdAt");

DO $$
BEGIN
  ALTER TABLE "WebChatMessage" ADD CONSTRAINT "WebChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WebChatSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
