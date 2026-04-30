import { type ModelMessage } from "ai";
import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";

import { generateExpenseAgentReply } from "@/lib/ai/run-expense-agent";
import { synthesizeSpeechMp3 } from "@/lib/ai/text-to-speech";
import { transcribeAudioOpenAI } from "@/lib/ai/transcribe-audio";
import {
  consumeAgentQuota,
  recordAgentModelUsage,
  recordAgentTokens,
} from "@/lib/agent-quota";
import { uploadTtsAudioToBlob } from "@/lib/blob/tts";
import { db } from "@/lib/db";
import { isLocale, type Locale } from "@/lib/i18n/locale";
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
// Bilingual hint for unlinked numbers: we don't know the user's locale yet,
// so we show both languages stacked.
const UNLINKED_HINT =
  "No tengo este número vinculado a una cuenta de Clara todavía. Iniciá la vinculación en Ajustes → Clara Assistant y mandame el código (LINK 123456) por acá.\n\n" +
  "I don't have this number linked to a Clara account yet. Start the link flow in Settings → Clara Assistant and send me the code (LINK 123456) here.";

type WhatsappStringKey =
  | "noFile"
  | "imageDownloadFailed"
  | "audioDownloadFailed"
  | "processThisCapture"
  | "voiceNotePrefix"
  | "unsupportedMedia"
  | "linkSuccess"
  | "accountDisabled"
  | "imagePlaceholder"
  | "agentError";

const WHATSAPP_STRINGS: Record<Locale, Record<WhatsappStringKey, string>> = {
  es: {
    noFile: "No recibí el archivo. ¿Lo mandás de nuevo?",
    imageDownloadFailed: "No pude descargar la imagen, ¿la mandás de nuevo?",
    audioDownloadFailed: "No pude descargar el audio, ¿lo mandás de nuevo?",
    processThisCapture: "Procesá esta captura.",
    voiceNotePrefix: "Nota de voz",
    unsupportedMedia:
      "Por ahora proceso texto, fotos y mensajes de voz. Este tipo de archivo no lo puedo usar.",
    linkSuccess:
      "Listo, vinculé este número a tu cuenta de Clara. Decime qué querés saber del mes, mandame una captura del banco o un mensaje de voz.",
    accountDisabled:
      "Tu cuenta de Clara está desactivada. Contactá al administrador para reactivarla.",
    imagePlaceholder: "[imagen]",
    agentError:
      "Tuve un problema procesando tu mensaje. Probá de nuevo en un momento.",
  },
  en: {
    noFile: "I didn't get the file. Can you send it again?",
    imageDownloadFailed: "I couldn't download the image. Can you send it again?",
    audioDownloadFailed: "I couldn't download the audio. Can you send it again?",
    processThisCapture: "Process this screenshot.",
    voiceNotePrefix: "Voice note",
    unsupportedMedia:
      "For now I can only process text, photos and voice messages. I can't use this file type.",
    linkSuccess:
      "Done, this number is now linked to your Clara account. Ask me anything about the month, send me a bank screenshot or a voice message.",
    accountDisabled:
      "Your Clara account is disabled. Contact the administrator to reactivate it.",
    imagePlaceholder: "[image]",
    agentError:
      "I had a problem processing your message. Try again in a moment.",
  },
};

function quotaLimitMessage(locale: Locale, limit: number): string {
  return locale === "en"
    ? `You've reached the daily limit of ${limit} assistant messages. It resets at 00:00 UTC.`
    : `Llegaste al límite diario de ${limit} mensajes con el asistente. Se reinicia a las 00:00 UTC.`;
}

function lowQuotaHint(locale: Locale, remaining: number): string {
  if (locale === "en") {
    return `_(You have ${remaining} assistant ${remaining === 1 ? "message" : "messages"} left today.)_`;
  }
  return `_(Te quedan ${remaining} ${remaining === 1 ? "mensaje" : "mensajes"} con el asistente hoy.)_`;
}

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

async function getUserLocale(userId: string): Promise<Locale> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { locale: true },
  });
  return isLocale(u?.locale) ? (u!.locale as Locale) : "es";
}

async function handleLinkedUser(
  userId: string,
  phone: string,
  text: string,
  numMedia: number,
  params: Record<string, string>,
) {
  const locale = await getUserLocale(userId);
  const t = WHATSAPP_STRINGS[locale];

  if (numMedia > 0) {
    const mediaUrl = params.MediaUrl0;
    const mediaType = params.MediaContentType0 ?? "";
    if (!mediaUrl) {
      await sendTwilioWhatsapp(phone, t.noFile);
      return;
    }

    if (mediaType.startsWith("image/")) {
      const media = await fetchTwilioMedia(mediaUrl);
      if (!media) {
        await sendTwilioWhatsapp(phone, t.imageDownloadFailed);
        return;
      }
      await respondToUser(userId, phone, text || t.processThisCapture, {
        mediaType: media.mediaType,
        buffer: media.buffer,
      });
      return;
    }

    if (mediaType.startsWith("audio/")) {
      const media = await fetchTwilioMedia(mediaUrl);
      if (!media) {
        await sendTwilioWhatsapp(phone, t.audioDownloadFailed);
        return;
      }
      const transcription = await transcribeAudioOpenAI({
        buffer: media.buffer,
        mediaType: media.mediaType || mediaType,
        locale,
      });
      if (!transcription.ok) {
        await sendTwilioWhatsapp(phone, transcription.message);
        return;
      }
      const caption = text.trim();
      const combined =
        caption ?
          `${caption}\n\n(${t.voiceNotePrefix}: ${transcription.text})`
        : transcription.text;
      await respondToUser(userId, phone, combined);
      return;
    }

    await sendTwilioWhatsapp(phone, t.unsupportedMedia);
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
  const locale = await getUserLocale(match.user.id);
  await sendTwilioWhatsapp(phone, WHATSAPP_STRINGS[locale].linkSuccess);
}

async function respondToUser(
  userId: string,
  phone: string,
  text: string,
  image?: { mediaType: string; buffer: Buffer },
) {
  const locale = await getUserLocale(userId);
  const t = WHATSAPP_STRINGS[locale];

  // Per-user daily cap shared with the web chat. Increment before invoking
  // the model so a crash mid-flight doesn't grant a free retry.
  const quota = await consumeAgentQuota(userId);
  if (!quota.ok) {
    if (quota.reason === "disabled") {
      await sendTwilioWhatsapp(phone, t.accountDisabled);
      return;
    }
    await sendTwilioWhatsapp(phone, quotaLimitMessage(locale, quota.limit));
    return;
  }

  const history = await loadHistory(userId);
  const userMessage: ModelMessage = image
    ? {
        role: "user",
        content: [
          { type: "text", text: text || t.processThisCapture },
          {
            type: "image",
            image: image.buffer,
            mediaType: image.mediaType,
          },
        ],
      }
    : { role: "user", content: text };

  await persistMessage(userId, "user", text || t.imagePlaceholder);

  let reply = "";
  let chartImageUrls: string[] = [];
  try {
    const result = await generateExpenseAgentReply({
      userId,
      messages: [...history, userMessage],
    });
    reply = result.text;
    chartImageUrls = result.chartImageUrls;
    await Promise.all([
      recordAgentTokens(userId, result.usage),
      recordAgentModelUsage(userId, result.model, result.usage),
    ]);
  } catch (error) {
    log.error("twilio.agent_error", { error: serializeError(error) });
    reply = t.agentError;
  }

  // Discreet "low quota" hint when the user is close to running out.
  if (quota.remaining > 0 && quota.remaining <= 3 && reply) {
    reply = `${reply}\n\n${lowQuotaHint(locale, quota.remaining)}`;
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
    const mp3 = await synthesizeSpeechMp3(reply, locale);
    if (mp3) {
      const uploaded = await uploadTtsAudioToBlob(Buffer.from(mp3));
      if (uploaded) {
        voiceOpts = {
          voiceMediaUrls: [uploaded.url],
          ...(chartImageUrls.length > 0 ? { chartMediaUrls: chartImageUrls } : {}),
        };
      }
    }
  }

  if (!voiceOpts && chartImageUrls.length > 0) {
    voiceOpts = { chartMediaUrls: chartImageUrls };
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
