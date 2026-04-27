/**
 * OpenAI speech API for WhatsApp voice-note replies (same API key as chat).
 */

const MAX_INPUT_CHARS = 4096;

export async function synthesizeSpeechMp3(text: string): Promise<Buffer | null> {
  const input = text.trim().slice(0, MAX_INPUT_CHARS);
  if (!input) return null;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.OPENAI_TTS_MODEL ?? "tts-1";
  const voice = process.env.OPENAI_TTS_VOICE ?? "nova";

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice,
      input,
      response_format: "mp3",
    }),
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
