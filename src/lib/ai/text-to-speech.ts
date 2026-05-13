/**
 * Speech synthesis for Telegram voice-note replies via OpenAI TTS.
 * Uses OPENAI_BASE_URL if set, otherwise calls api.openai.com directly.
 * The Vercel AI Gateway does not proxy /audio/* endpoints.
 */

import { resolveGatewayApiKeyFromEnv } from "@/lib/ai/gateway-auth";
import type { Locale } from "@/lib/i18n/locale";

const MAX_INPUT_CHARS = 4096;

const DEFAULT_MODEL = "gpt-4o-mini-tts";

const DEFAULT_INSTRUCTIONS_ES =
  "Hablá en español con pronunciación natural rioplatense (Argentina/Uruguay), sin acento inglés.";

const DEFAULT_INSTRUCTIONS_EN =
  "Speak in neutral conversational American English with a friendly, calm tone.";

function modelSupportsSpeechInstructions(model: string): boolean {
  return model !== "tts-1" && model !== "tts-1-hd";
}

export async function synthesizeSpeechMp3(
  text: string,
  locale: Locale = "es",
): Promise<Buffer | null> {
  const input = text.trim().slice(0, MAX_INPUT_CHARS);
  if (!input) return null;

  const apiKey = process.env.OPENAI_API_KEY?.trim() || resolveGatewayApiKeyFromEnv();
  if (!apiKey) return null;

  const model = process.env.OPENAI_TTS_MODEL?.trim() || DEFAULT_MODEL;
  // Voice picker: keep `nova` as the default for both locales (it's neutral
  // enough), but allow overriding per-locale via env.
  const voice =
    (locale === "en"
      ? process.env.OPENAI_TTS_VOICE_EN?.trim()
      : process.env.OPENAI_TTS_VOICE_ES?.trim()) ||
    process.env.OPENAI_TTS_VOICE?.trim() ||
    "nova";
  const instructionsFromEnv =
    (locale === "en"
      ? process.env.OPENAI_TTS_INSTRUCTIONS_EN?.trim()
      : process.env.OPENAI_TTS_INSTRUCTIONS_ES?.trim()) ||
    process.env.OPENAI_TTS_INSTRUCTIONS?.trim();

  const body: Record<string, unknown> = {
    model,
    voice,
    input,
    response_format: "mp3",
  };

  if (modelSupportsSpeechInstructions(model)) {
    body.instructions =
      instructionsFromEnv ||
      (locale === "en" ? DEFAULT_INSTRUCTIONS_EN : DEFAULT_INSTRUCTIONS_ES);
  }

  const base = process.env.OPENAI_BASE_URL?.replace(/\/+$/, "") || "https://api.openai.com/v1";
  const res = await fetch(`${base}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = (await res.json()) as { error?: { message?: string } };
      detail = err?.error?.message ?? detail;
    } catch {
      /* ignore */
    }
    console.error("[etracker.tts] speech_failed", res.status, detail);
    return null;
  }

  return Buffer.from(await res.arrayBuffer());
}
