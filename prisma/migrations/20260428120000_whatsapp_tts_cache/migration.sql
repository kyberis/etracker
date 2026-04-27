-- CreateTable
CREATE TABLE IF NOT EXISTS "TtsAudioCache" (
    "id" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'audio/mpeg',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TtsAudioCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TtsAudioCache_expiresAt_idx" ON "TtsAudioCache"("expiresAt");
