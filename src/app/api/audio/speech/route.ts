import { synthesizeSpeechMp3 } from "@/lib/ai/text-to-speech";
import { uploadTtsAudioToBlob } from "@/lib/blob/tts";
import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { isLocale, type Locale } from "@/lib/i18n/locale";
import { limitByUser } from "@/lib/rate-limit";
import { requireUserId } from "@/lib/session";

const MAX_CHARS = 4096;

/**
 * Generate TTS for the in-app chat UI and return a short-lived signed Vercel
 * Blob URL. Without a Blob token we return 503 (the chat UI degrades to
 * text-only). The legacy Postgres `TtsAudioCache` model + `/api/audio/tts/[id]`
 * route were dropped in this same migration.
 */
export async function POST(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();

    const limited = await limitByUser(
      "audio-speech",
      userId,
      30,
      "1 d",
      "You've reached the daily assistant audio limit.",
    );
    if (!limited.ok) return limited.response;

    if (!process.env.OPENAI_API_KEY?.trim()) {
      return jsonError(
        "OPENAI_API_KEY is not configured — chat TTS is unavailable.",
        503,
      );
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return jsonError(
        "BLOB_READ_WRITE_TOKEN is not configured — audio storage is unavailable.",
        503,
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON.", 400);
    }

    const text =
      typeof body === "object" &&
      body !== null &&
      "text" in body &&
      typeof (body as { text: unknown }).text === "string"
        ? (body as { text: string }).text.trim().slice(0, MAX_CHARS)
        : "";

    if (!text) {
      return jsonError('Send { "text": "…" } with content.', 400);
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { locale: true },
    });
    const locale: Locale = isLocale(user?.locale) ? (user!.locale as Locale) : "es";
    const mp3 = await synthesizeSpeechMp3(text, locale);
    if (!mp3) {
      return jsonError("No se pudo generar el audio.", 500);
    }

    const uploaded = await uploadTtsAudioToBlob(Buffer.from(mp3));
    if (!uploaded) {
      return jsonError("No se pudo guardar el audio.", 500);
    }

    return { audioUrl: uploaded.url };
  });
}
