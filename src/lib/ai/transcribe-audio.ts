/**
 * Speech-to-text for Telegram voice notes via OpenAI Whisper.
 * Uses OPENAI_BASE_URL if set, otherwise calls api.openai.com directly.
 * The Vercel AI Gateway does not proxy /audio/* endpoints.
 */

import { resolveGatewayApiKeyFromEnv } from "@/lib/ai/gateway-auth";

/** For direct OpenAI endpoints (audio), prefer OPENAI_API_KEY over Gateway tokens. */
function resolveOpenAIDirectKey(): string | null {
  return (
    process.env.OPENAI_API_KEY?.trim() ||
    resolveGatewayApiKeyFromEnv()
  );
}
import type { Locale } from "@/lib/i18n/locale";

const TRANSCRIPTION_MODEL =
  process.env.OPENAI_TRANSCRIPTION_MODEL ?? "whisper-1";

/** Extension hint for Whisper; Telegram often sends OGG Opus. */
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

const TRANSCRIBE_MESSAGES: Record<
  Locale,
  { missingKey: string; failure: string; empty: string }
> = {
  es: {
    missingKey: "API de IA no configurada (AI Gateway).",
    failure:
      "No pude convertir el audio en texto (formato no soportado o error del servicio). Probá grabar de nuevo más corto o mandá texto.",
    empty: "El audio no tenía contenido reconocible. ¿Podés repetir o escribir el mensaje?",
  },
  en: {
    missingKey: "AI API is not configured (AI Gateway).",
    failure:
      "I couldn't convert the audio to text (unsupported format or service error). Try recording a shorter clip or send text.",
    empty: "The audio had no recognizable content. Can you repeat or type the message?",
  },
};

export async function transcribeAudioOpenAI(opts: {
  buffer: Buffer;
  mediaType: string;
  locale?: Locale;
}): Promise<TranscribeResult> {
  const locale: Locale = opts.locale ?? "es";
  const messages = TRANSCRIBE_MESSAGES[locale];

  const apiKey = resolveOpenAIDirectKey();
  if (!apiKey) {
    return { ok: false, message: messages.missingKey };
  }

  const filename = guessAudioFilename(opts.mediaType);
  const bytes = new Uint8Array(opts.buffer);
  const mime = opts.mediaType.split(";")[0]?.trim() || "application/octet-stream";
  const blob = new Blob([bytes], { type: mime });

  const form = new FormData();
  form.append("file", blob, filename);
  form.append("model", TRANSCRIPTION_MODEL);
  form.append("language", locale);

  const base = process.env.OPENAI_BASE_URL?.replace(/\/+$/, "") || "https://api.openai.com/v1";
  const res = await fetch(`${base}/audio/transcriptions`, {
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
    return { ok: false, message: messages.failure };
  }

  const data = (await res.json()) as { text?: string };
  const raw = typeof data.text === "string" ? data.text.trim() : "";
  if (!raw) {
    return { ok: false, message: messages.empty };
  }

  return { ok: true, text: raw };
}
