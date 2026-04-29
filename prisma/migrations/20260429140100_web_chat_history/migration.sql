-- CreateTable: rolling history for the web chat (`/app`) per user.
-- We persist full `UIMessage.parts` (text/file/tool-*) as JSONB so bubbles
-- re-render identically — including tool calls, charts and image attachments
-- — when the user comes back later.
CREATE TABLE IF NOT EXISTS "WebChatMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "parts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WebChatMessage_userId_createdAt_idx" ON "WebChatMessage"("userId", "createdAt");

-- AddForeignKey (skip if already present)
DO $$
BEGIN
  ALTER TABLE "WebChatMessage" ADD CONSTRAINT "WebChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
