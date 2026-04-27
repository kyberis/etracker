/**
 * OpenAI speech API for WhatsApp voice-note replies (same API key as chat).
 * Spanish by default: `gpt-4o-mini-tts` + instructions (`tts-1` has no instructions and tends to sound English-accented).
 */

const MAX_INPUT_CHARS = 4096;

const DEFAULT_MODEL = "gpt-4o-mini-tts";

const DEFAULT_INSTRUCTIONS_ES =
  "Hablá en español con pronunciación natural rioplatense (Argentina/Uruguay), sin acento inglés.";

function modelSupportsSpeechInstructions(model: string): boolean {
  return model !== "tts-1" && model !== "tts-1-hd";
}

export async function synthesizeSpeechMp3(text: string): Promise<Buffer | null> {
  const input = text.trim().slice(0, MAX_INPUT_CHARS);
  if (!input) return null;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.OPENAI_TTS_MODEL?.trim() || DEFAULT_MODEL;
  const voice = process.env.OPENAI_TTS_VOICE?.trim() || "nova";
  const instructionsFromEnv = process.env.OPENAI_TTS_INSTRUCTIONS?.trim();

  const body: Record<string, unknown> = {
    model,
    voice,
    input,
    response_format: "mp3",
  };

  if (modelSupportsSpeechInstructions(model)) {
    body.instructions = instructionsFromEnv || DEFAULT_INSTRUCTIONS_ES;
  }

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
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
