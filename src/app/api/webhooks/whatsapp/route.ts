import { type ModelMessage } from "ai";
import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";

import { generateExpenseAgentReply } from "@/lib/ai/run-expense-agent";
import { db } from "@/lib/db";
import { findUserByLinkCode, normalizePhone } from "@/lib/whatsapp/link";
import {
  candidateWebhookUrls,
  fetchTwilioMedia,
  sendTwilioWhatsapp,
  verifyTwilioWebhookRequest,
} from "@/lib/whatsapp/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// OpenAI tool loops + Twilio REST can exceed the default 10s on Hobby/Pro.
export const maxDuration = 60;

const HISTORY_WINDOW = 12;
const UNLINKED_HINT =
  "No tengo este número vinculado a una cuenta de eTracker todavía. Iniciá la vinculación en Ajustes → eTracker Assistant y mandame el código (LINK 123456) por acá.";

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
    console.log(
      "[etracker.twilio] post_raw",
      JSON.stringify({
        bodyBytes: rawBody.length,
        host: request.headers.get("host"),
        xfHost: request.headers.get("x-forwarded-host"),
        xfProto: request.headers.get("x-forwarded-proto"),
        url: request.url,
      }),
    );

    const params = Object.fromEntries(new URLSearchParams(rawBody));
    const signature = request.headers.get("x-twilio-signature");
    const auth = verifyTwilioWebhookRequest(signature, request, params);

    if (!auth.ok) {
      const candidates = candidateWebhookUrls(request);
      console.error("[etracker.twilio] invalid_signature", {
        hasSignature: Boolean(signature),
        candidateCount: candidates.length,
        sampleCandidates: candidates.slice(0, 5),
        hint: "If this persists, set TWILIO_WEBHOOK_PUBLIC_URL in Vercel to the exact webhook URL from Twilio (https://…/api/webhooks/whatsapp).",
      });
      return new NextResponse("Invalid signature", { status: 401 });
    }

    console.log("[etracker.twilio] signature_ok", JSON.stringify({ url: auth.matchedUrl }));

    console.log(
      "[etracker.twilio] inbound",
      JSON.stringify({
        from: params.From,
        bodyLen: (params.Body ?? "").length,
        numMedia: params.NumMedia ?? "0",
        messageSid: params.MessageSid,
      }),
    );

    const fromRaw = params.From ?? "";
    const phone = normalizePhone(fromRaw.replace(/^whatsapp:/i, ""));
    if (!phone) {
      console.log("[etracker.twilio] skip_no_phone", JSON.stringify({ fromRaw }));
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
        console.log("[etracker.twilio] path=unlinked_text await tryCompleteLink");
        await tryCompleteLink(phone, text);
      } else {
        console.log("[etracker.twilio] path=unlinked_no_text await hint");
        await sendTwilioWhatsapp(phone, UNLINKED_HINT);
      }
      return twimlResponse();
    }

    console.log("[etracker.twilio] path=linked schedule agent");
    waitUntil(
      (async () => {
        try {
          await handleLinkedUser(linkedUser.id, phone, text, numMedia, params);
        } catch (error) {
          console.error("[etracker.twilio] linked handler error", error);
        }
      })(),
    );

    return twimlResponse();
  } catch (error) {
    console.error("[etracker.twilio] POST fatal", error);
    // Still 200 so Twilio doesn't hammer retries for our bug; check logs.
    return twimlResponse();
  }
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
    if (!mediaUrl || !mediaType.startsWith("image/")) {
      await sendTwilioWhatsapp(
        phone,
        "Por ahora solo proceso texto y fotos. Mandame uno de esos formatos.",
      );
      return;
    }
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

  if (text) {
    await respondToUser(userId, phone, text);
  }
}

async function tryCompleteLink(phone: string, text: string) {
  const match = await findUserByLinkCode(text);
  if (!match) {
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
  await sendTwilioWhatsapp(
    phone,
    "Listo, vinculé este número a tu cuenta de eTracker. Decime qué querés saber del mes o mandame una captura del banco.",
  );
}

async function respondToUser(
  userId: string,
  phone: string,
  text: string,
  image?: { mediaType: string; buffer: Buffer },
) {
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
    reply = await generateExpenseAgentReply({
      userId,
      messages: [...history, userMessage],
    });
  } catch (error) {
    console.error("[etracker.twilio] agent error", error);
    reply = "Tuve un problema procesando tu mensaje. Probá de nuevo en un momento.";
  }

  await persistMessage(userId, "assistant", reply);
  await sendTwilioWhatsapp(phone, reply);
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
