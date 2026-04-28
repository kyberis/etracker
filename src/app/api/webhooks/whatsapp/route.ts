import { type ModelMessage } from "ai";
import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";

import { generateExpenseAgentReply } from "@/lib/ai/run-expense-agent";
import { synthesizeSpeechMp3 } from "@/lib/ai/text-to-speech";
import { transcribeAudioOpenAI } from "@/lib/ai/transcribe-audio";
import { consumeAgentQuota, recordAgentTokens } from "@/lib/agent-quota";
import { uploadTtsAudioToBlob } from "@/lib/blob/tts";
import { db } from "@/lib/db";
import { log } from "@/lib/log";
import { findUserByLinkCode, normalizePhone } from "@/lib/whatsapp/link";
import {
  candidateWebhookUrls,
  fetchTwilioMedia,
  sendTwilioWhatsapp,
  type SendTwilioWhatsappOptions,
  verifyTwilioWebhookRequest,
} from "@/lib/whatsapp/twilio";

// OpenAI tool loops + Twilio REST can exceed the default 10s on Hobby/Pro.
export const maxDuration = 60;

const HISTORY_WINDOW = 12;
/** OpenAI TTS input limit; longer replies stay text-only when voice is enabled. */
const WHATSAPP_TTS_MAX_CHARS = 4096;

function isWhatsappVoiceReplyEnabled(): boolean {
  const v = process.env.WHATSAPP_VOICE_REPLY?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
const UNLINKED_HINT =
  "No tengo este número vinculado a una cuenta de Clara todavía. Iniciá la vinculación en Ajustes → Clara Assistant y mandame el código (LINK 123456) por acá.";

const TWIML_OK = '<?xml version="1.0" encoding="UTF-8"?><Response/>';

function twimlResponse(): NextResponse {
  return new NextResponse(TWIML_OK, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

/** Sanity check from a browser or `curl` — Twilio only uses POST. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "etracker-whatsapp-webhook",
    ts: new Date().toISOString(),
  });
}

// Twilio doesn't do a verification handshake (Meta-style). We only accept POST.
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    log.info("twilio.post_raw", {
      bodyBytes: rawBody.length,
      host: request.headers.get("host"),
      xfHost: request.headers.get("x-forwarded-host"),
      xfProto: request.headers.get("x-forwarded-proto"),
      url: request.url,
    });

    const params = Object.fromEntries(new URLSearchParams(rawBody));
    const signature = request.headers.get("x-twilio-signature");
    const auth = verifyTwilioWebhookRequest(signature, request, params);

    if (!auth.ok) {
      const candidates = candidateWebhookUrls(request);
      log.error("twilio.invalid_signature", {
        hasSignature: Boolean(signature),
        candidateCount: candidates.length,
        sampleCandidates: candidates.slice(0, 5),
        hint: "If this persists, set TWILIO_WEBHOOK_PUBLIC_URL in Vercel to the exact webhook URL from Twilio (https://…/api/webhooks/whatsapp).",
      });
      return new NextResponse("Invalid signature", { status: 401 });
    }

    log.info("twilio.signature_ok", { url: auth.matchedUrl });

    log.info("twilio.inbound", {
      from: params.From,
      bodyLen: (params.Body ?? "").length,
      numMedia: params.NumMedia ?? "0",
      messageSid: params.MessageSid,
    });

    const fromRaw = params.From ?? "";
    const phone = normalizePhone(fromRaw.replace(/^whatsapp:/i, ""));
    if (!phone) {
      log.info("twilio.skip_no_phone", { fromRaw });
      return twimlResponse();
    }

    const text = (params.Body ?? "").trim();
    const numMedia = Number.parseInt(params.NumMedia ?? "0", 10) || 0;

    const linkedUser = await db.user.findUnique({
      where: { whatsappPhone: phone },
      select: { id: true },
    });

    /**
     * Critical: the "link this number" path must finish *before* we return
     * TwiML. On Vercel, `after()` / fire-and-forget promises are not reliable
     * — the isolate is frozen right after the response is sent, so
     * `tryCompleteLink` + `sendTwilioWhatsapp` never ran. Users saw HTTP 200 in
     * Vercel (empty TwiML ack) but no WhatsApp reply and no logs from the
     * background work.
     *
     * The heavy path (OpenAI + tools) still uses `waitUntil()` so we respond
     * fast to Twilio but keep the function alive until the outbound message is
     * sent.
     */
    if (!linkedUser) {
      if (text) {
        log.info("twilio.path_unlinked_has_text");
        await tryCompleteLink(phone, text);
      } else {
        log.info("twilio.path_unlinked_no_text");
        await sendTwilioWhatsapp(phone, UNLINKED_HINT);
      }
      return twimlResponse();
    }

    log.info("twilio.path_linked_schedule");
    waitUntil(
      (async () => {
        try {
          await handleLinkedUser(linkedUser.id, phone, text, numMedia, params);
        } catch (error) {
          log.error("twilio.linked_handler_error", { error: serializeError(error) });
        }
      })(),
    );

    return twimlResponse();
  } catch (error) {
    log.error("twilio.post_fatal", { error: serializeError(error) });
    // Still 200 so Twilio doesn't hammer retries for our bug; check logs.
    return twimlResponse();
  }
}

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return error;
}

async function handleLinkedUser(
  userId: string,
  phone: string,
  text: string,
  numMedia: number,
  params: Record<string, string>,
) {
  if (numMedia > 0) {
    const mediaUrl = params.MediaUrl0;
    const mediaType = params.MediaContentType0 ?? "";
    if (!mediaUrl) {
      await sendTwilioWhatsapp(
        phone,
        "No recibí el archivo. ¿Lo mandás de nuevo?",
      );
      return;
    }

    if (mediaType.startsWith("image/")) {
      const media = await fetchTwilioMedia(mediaUrl);
      if (!media) {
        await sendTwilioWhatsapp(
          phone,
          "No pude descargar la imagen, ¿la mandás de nuevo?",
        );
        return;
      }
      await respondToUser(userId, phone, text || "Procesá esta captura.", {
        mediaType: media.mediaType,
        buffer: media.buffer,
      });
      return;
    }

    if (mediaType.startsWith("audio/")) {
      const media = await fetchTwilioMedia(mediaUrl);
      if (!media) {
        await sendTwilioWhatsapp(
          phone,
          "No pude descargar el audio, ¿lo mandás de nuevo?",
        );
        return;
      }
      const transcription = await transcribeAudioOpenAI({
        buffer: media.buffer,
        mediaType: media.mediaType || mediaType,
      });
      if (!transcription.ok) {
        await sendTwilioWhatsapp(phone, transcription.message);
        return;
      }
      const caption = text.trim();
      const combined =
        caption ?
          `${caption}\n\n(Nota de voz: ${transcription.text})`
        : transcription.text;
      await respondToUser(userId, phone, combined);
      return;
    }

    await sendTwilioWhatsapp(
      phone,
      "Por ahora proceso texto, fotos y mensajes de voz. Este tipo de archivo no lo puedo usar.",
    );
    return;
  }

  if (text) {
    await respondToUser(userId, phone, text);
  }
}

async function tryCompleteLink(phone: string, text: string) {
  const match = await findUserByLinkCode(text);
  if (!match) {
    log.info("twilio.link_no_match", { phone, bodyLen: text.length });
    await sendTwilioWhatsapp(phone, UNLINKED_HINT);
    return;
  }
  await db.user.update({
    where: { id: match.user.id },
    data: {
      whatsappPhone: phone,
      whatsappVerifiedAt: new Date(),
      whatsappLinkCode: null,
      whatsappLinkCodeExpires: null,
    },
  });
  log.info("twilio.link_ok", { userId: match.user.id, phone });
  await sendTwilioWhatsapp(
    phone,
    "Listo, vinculé este número a tu cuenta de Clara. Decime qué querés saber del mes, mandame una captura del banco o un mensaje de voz.",
  );
}

async function respondToUser(
  userId: string,
  phone: string,
  text: string,
  image?: { mediaType: string; buffer: Buffer },
) {
  // Per-user daily cap shared with the web chat. Increment before invoking
  // the model so a crash mid-flight doesn't grant a free retry.
  const quota = await consumeAgentQuota(userId);
  if (!quota.ok) {
    if (quota.reason === "disabled") {
      await sendTwilioWhatsapp(
        phone,
        "Tu cuenta de Clara está desactivada. Contactá al administrador para reactivarla.",
      );
      return;
    }
    await sendTwilioWhatsapp(
      phone,
      `Llegaste al límite diario de ${quota.limit} mensajes con el asistente. Se reinicia a las 00:00 UTC.`,
    );
    return;
  }

  const history = await loadHistory(userId);
  const userMessage: ModelMessage = image
    ? {
        role: "user",
        content: [
          { type: "text", text: text || "Procesá esta captura." },
          {
            type: "image",
            image: image.buffer,
            mediaType: image.mediaType,
          },
        ],
      }
    : { role: "user", content: text };

  await persistMessage(userId, "user", text || "[imagen]");

  let reply = "";
  try {
    const result = await generateExpenseAgentReply({
      userId,
      messages: [...history, userMessage],
    });
    reply = result.text;
    await recordAgentTokens(userId, result.usage);
  } catch (error) {
    log.error("twilio.agent_error", { error: serializeError(error) });
    reply = "Tuve un problema procesando tu mensaje. Probá de nuevo en un momento.";
  }

  // Discreet "low quota" hint when the user is close to running out.
  if (quota.remaining > 0 && quota.remaining <= 3 && reply) {
    reply = `${reply}\n\n_(Te quedan ${quota.remaining} ${quota.remaining === 1 ? "mensaje" : "mensajes"} con el asistente hoy.)_`;
  }

  await persistMessage(userId, "assistant", reply);

  let voiceOpts: SendTwilioWhatsappOptions | undefined;
  // Voice replies need an HTTPS URL Twilio can fetch. We use Vercel Blob
  // (signed-ish, randomized pathname) and skip silently if either OpenAI or
  // the Blob token aren't configured — the user still gets the text reply.
  if (
    isWhatsappVoiceReplyEnabled() &&
    process.env.OPENAI_API_KEY &&
    process.env.BLOB_READ_WRITE_TOKEN &&
    reply.length > 0 &&
    reply.length <= WHATSAPP_TTS_MAX_CHARS
  ) {
    const mp3 = await synthesizeSpeechMp3(reply);
    if (mp3) {
      const uploaded = await uploadTtsAudioToBlob(Buffer.from(mp3));
      if (uploaded) {
        voiceOpts = { voiceMediaUrls: [uploaded.url] };
      }
    }
  }

  await sendTwilioWhatsapp(phone, reply, voiceOpts);
}

async function loadHistory(userId: string): Promise<ModelMessage[]> {
  const rows = await db.whatsappMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_WINDOW,
  });
  return rows
    .reverse()
    .map((row) =>
      row.role === "assistant"
        ? ({ role: "assistant", content: row.text } satisfies ModelMessage)
        : ({ role: "user", content: row.text } satisfies ModelMessage),
    );
}

async function persistMessage(
  userId: string,
  role: "user" | "assistant",
  text: string,
) {
  await db.whatsappMessage.create({
    data: { userId, role, text: text.slice(0, 4000) },
  });
}
