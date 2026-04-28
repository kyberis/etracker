import { synthesizeSpeechMp3 } from "@/lib/ai/text-to-speech";
import { uploadTtsAudioToBlob } from "@/lib/blob/tts";
import { jsonError, withApi } from "@/lib/http";
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
      "Llegaste al límite diario de audio del asistente.",
    );
    if (!limited.ok) return limited.response;

    if (!process.env.OPENAI_API_KEY?.trim()) {
      return jsonError(
        "OPENAI_API_KEY no configurada — el TTS del chat no está disponible.",
        503,
      );
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return jsonError(
        "BLOB_READ_WRITE_TOKEN no configurado — el almacenamiento de audio no está disponible.",
        503,
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("JSON inválido.", 400);
    }

    const text =
      typeof body === "object" &&
      body !== null &&
      "text" in body &&
      typeof (body as { text: unknown }).text === "string"
        ? (body as { text: string }).text.trim().slice(0, MAX_CHARS)
        : "";

    if (!text) {
      return jsonError('Enviá { "text": "…" } con contenido.', 400);
    }

    const mp3 = await synthesizeSpeechMp3(text);
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
