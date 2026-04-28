-- Drop the temporary TTS audio cache table. Audio is now uploaded to Vercel
-- Blob (`src/lib/blob/tts.ts`) and the signed URL is passed straight to Twilio
-- (`mediaUrl`) for WhatsApp voice replies — no need to round-trip through
-- Postgres + a custom GET endpoint anymore.

DROP TABLE IF EXISTS "TtsAudioCache";
