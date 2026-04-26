import { type ModelMessage } from "ai";
import { NextResponse, after } from "next/server";

import { generateExpenseAgentReply } from "@/lib/ai/run-expense-agent";
import { db } from "@/lib/db";
import { findUserByLinkCode, normalizePhone } from "@/lib/whatsapp/link";
import {
  buildPublicUrl,
  fetchTwilioMedia,
  sendTwilioWhatsapp,
  verifyTwilioSignature,
} from "@/lib/whatsapp/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The agent + tool calls + outbound Twilio request can comfortably take more
// than the default 10s. 60s is the Pro/Fluid ceiling and gives us breathing
// room without blowing past Twilio's own request timeout (which is irrelevant
// here because we already responded with empty TwiML).
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

// Twilio doesn't do a verification handshake (Meta-style). We only accept POST.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));
  const signature = request.headers.get("x-twilio-signature");
  const url = buildPublicUrl(request);

  if (!verifyTwilioSignature(signature, url, params)) {
    console.warn("[twilio whatsapp] invalid signature", {
      hasSignature: Boolean(signature),
      url,
    });
    return new NextResponse("Invalid signature", { status: 401 });
  }

  console.info("[twilio whatsapp] inbound", {
    from: params.From,
    bodyLength: (params.Body ?? "").length,
    numMedia: params.NumMedia ?? "0",
    messageSid: params.MessageSid,
  });

  // Acknowledge with empty TwiML immediately so Twilio doesn't retry. The
  // actual processing (agent + outbound Twilio REST call) is scheduled with
  // `after()` so Vercel keeps the function alive past the response — using
  // `void promise.catch()` doesn't work on serverless because the runtime can
  // freeze the execution context as soon as we return.
  after(async () => {
    try {
      await handleMessage(params);
    } catch (error) {
      console.error("[twilio whatsapp] handler error", error);
    }
  });

  return twimlResponse();
}

async function handleMessage(params: Record<string, string>) {
  const fromRaw = params.From ?? "";
  const phone = normalizePhone(fromRaw.replace(/^whatsapp:/i, ""));
  if (!phone) return;

  const text = (params.Body ?? "").trim();
  const numMedia = Number.parseInt(params.NumMedia ?? "0", 10) || 0;

  const linkedUser = await db.user.findUnique({
    where: { whatsappPhone: phone },
    select: { id: true },
  });

  if (!linkedUser) {
    if (text) {
      await tryCompleteLink(phone, text);
    } else {
      await sendTwilioWhatsapp(phone, UNLINKED_HINT);
    }
    return;
  }

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
    await respondToUser(linkedUser.id, phone, text || "Procesá esta captura.", {
      mediaType: media.mediaType,
      buffer: media.buffer,
    });
    return;
  }

  if (text) {
    await respondToUser(linkedUser.id, phone, text);
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
    console.error("[twilio whatsapp] agent error", error);
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
