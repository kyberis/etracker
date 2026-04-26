import { type ModelMessage } from "ai";
import { NextResponse } from "next/server";

import { generateExpenseAgentReply } from "@/lib/ai/run-expense-agent";
import { db } from "@/lib/db";
import {
  fetchWhatsappMedia,
  sendWhatsappText,
  verifySignature,
} from "@/lib/whatsapp/cloud-api";
import { findUserByLinkCode, normalizePhone } from "@/lib/whatsapp/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HISTORY_WINDOW = 12;
const UNLINKED_HINT =
  "No tengo este número vinculado a una cuenta de eTracker todavía. Iniciá la vinculación en Ajustes → eTracker Assistant y mandame el código (LINK 123456) por acá.";

// --- GET: Meta verification handshake ---------------------------------------
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token &&
    process.env.WHATSAPP_VERIFY_TOKEN &&
    token === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// --- POST: incoming messages -------------------------------------------------
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifySignature(rawBody, signature)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  // Always 200 fast: Meta retries on non-2xx, and we'd rather process work
  // in the background.
  void handlePayload(rawBody).catch((error) => {
    console.error("[whatsapp] handler error", error);
  });

  return new NextResponse("ok", { status: 200 });
}

type IncomingMessage = {
  from: string;
  id: string;
  type: string;
  text?: { body?: string };
  image?: { id: string; mime_type?: string; caption?: string };
};

async function handlePayload(rawBody: string) {
  const payload = safeParse(rawBody);
  if (!payload) return;

  const messages = extractMessages(payload);
  for (const message of messages) {
    await handleSingleMessage(message);
  }
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractMessages(payload: unknown): IncomingMessage[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as { entry?: Array<{ changes?: Array<{ value?: { messages?: IncomingMessage[] } }> }> };
  const out: IncomingMessage[] = [];
  for (const entry of root.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        out.push(message);
      }
    }
  }
  return out;
}

async function handleSingleMessage(message: IncomingMessage) {
  const phone = normalizePhone(message.from);
  if (!phone) return;

  // Resolve identity. If the phone isn't linked yet, the only valid action is
  // a `LINK 123456` style message that completes verification.
  const linkedUser = await db.user.findUnique({
    where: { whatsappPhone: phone },
    select: { id: true },
  });

  if (message.type === "text" && message.text) {
    const text = message.text.body ?? "";
    if (!linkedUser) {
      await tryCompleteLink(phone, text);
      return;
    }
    await respondToUser(linkedUser.id, phone, text);
    return;
  }

  if (message.type === "image" && message.image) {
    if (!linkedUser) {
      await sendWhatsappText(phone, UNLINKED_HINT);
      return;
    }
    const caption = message.image.caption ?? "Procesá esta captura.";
    const media = await fetchWhatsappMedia(message.image.id);
    if (!media) {
      await sendWhatsappText(phone, "No pude descargar la imagen, ¿la mandás de nuevo?");
      return;
    }
    await respondToUser(linkedUser.id, phone, caption, {
      mediaType: media.mediaType,
      buffer: media.buffer,
    });
    return;
  }

  // Other message types (audio, sticker, etc.) – politely ack.
  if (linkedUser) {
    await sendWhatsappText(
      phone,
      "Por ahora solo proceso texto y fotos. Mandame uno de esos formatos.",
    );
  }
}

async function tryCompleteLink(phone: string, text: string) {
  const match = await findUserByLinkCode(text);
  if (!match) {
    await sendWhatsappText(phone, UNLINKED_HINT);
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
  await sendWhatsappText(
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
    console.error("[whatsapp] agent error", error);
    reply = "Tuve un problema procesando tu mensaje. Probá de nuevo en un momento.";
  }

  await persistMessage(userId, "assistant", reply);
  await sendWhatsappText(phone, reply);
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

async function persistMessage(userId: string, role: "user" | "assistant", text: string) {
  await db.whatsappMessage.create({
    data: { userId, role, text: text.slice(0, 4000) },
  });
}
