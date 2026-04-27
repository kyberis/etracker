import { NextResponse } from "next/server";

import { synthesizeSpeechMp3 } from "@/lib/ai/text-to-speech";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CHARS = 4096;

/** Generate TTS for signed-in chat UI; MP3 served from GET /api/audio/tts/[id]. */
export async function POST(request: Request) {
  try {
    await requireUserId();
  } catch {
    return jsonError("Unauthorized.", 401);
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return jsonError("OPENAI_API_KEY no configurada.", 500);
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

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const row = await db.ttsAudioCache.create({
    data: {
      data: new Uint8Array(mp3),
      mimeType: "audio/mpeg",
      expiresAt,
    },
  });

  return NextResponse.json({ audioUrl: `/api/audio/tts/${row.id}` });
}
