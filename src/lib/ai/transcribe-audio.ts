/**
 * Speech-to-text for WhatsApp voice notes via OpenAI Whisper (same API key as chat).
 */

const TRANSCRIPTION_MODEL =
  process.env.OPENAI_TRANSCRIPTION_MODEL ?? "whisper-1";

/** Extension hint for Whisper; WhatsApp/Twilio often sends OGG Opus or AMR. */
export function guessAudioFilename(mediaType: string): string {
  const mt = mediaType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (mt.includes("ogg")) return "voice.ogg";
  if (mt.includes("mpeg") || mt === "audio/mp3") return "voice.mp3";
  if (mt.includes("mp4") || mt.includes("m4a")) return "voice.m4a";
  if (mt.includes("wav")) return "voice.wav";
  if (mt.includes("webm")) return "voice.webm";
  if (mt.includes("aac")) return "voice.aac";
  if (mt.includes("flac")) return "voice.flac";
  if (mt.includes("amr")) return "voice.amr";
  return "voice.ogg";
}

export type TranscribeResult =
  | { ok: true; text: string }
  | { ok: false; message: string };

export async function transcribeAudioOpenAI(opts: {
  buffer: Buffer;
  mediaType: string;
}): Promise<TranscribeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    return { ok: false, message: "OPENAI_API_KEY no configurada." };
  }

  const filename = guessAudioFilename(opts.mediaType);
  const bytes = new Uint8Array(opts.buffer);
  const mime = opts.mediaType.split(";")[0]?.trim() || "application/octet-stream";
  const blob = new Blob([bytes], { type: mime });

  const form = new FormData();
  form.append("file", blob, filename);
  form.append("model", TRANSCRIPTION_MODEL);
  form.append("language", "es");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const errJson = (await res.json()) as { error?: { message?: string } };
      detail = errJson?.error?.message ?? detail;
    } catch {
      /* ignore */
    }
    console.error("[etracker.whisper] transcription_failed", res.status, detail);
    return {
      ok: false,
      message:
        "No pude convertir el audio en texto (formato no soportado o error del servicio). Probá grabar de nuevo más corto o mandá texto.",
    };
  }

  const data = (await res.json()) as { text?: string };
  const raw = typeof data.text === "string" ? data.text.trim() : "";
  if (!raw) {
    return {
      ok: false,
      message:
        "El audio no tenía contenido reconocible. ¿Podés repetir o escribir el mensaje?",
    };
  }

  return { ok: true, text: raw };
}
