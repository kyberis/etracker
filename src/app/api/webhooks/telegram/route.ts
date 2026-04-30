import { type ModelMessage } from "ai";
import { NextResponse } from "next/server";

import { generateExpenseAgentReply } from "@/lib/ai/run-expense-agent";
import { transcribeAudioOpenAI } from "@/lib/ai/transcribe-audio";
import {
  consumeAgentQuota,
  recordAgentModelUsage,
  recordAgentTokens,
} from "@/lib/agent-quota";
import { db } from "@/lib/db";
import { isLocale, type Locale } from "@/lib/i18n/locale";
import { log } from "@/lib/log";
import {
  buildMenuKeyboard,
  callbackToPrompt,
  getTelegramStrings,
} from "@/lib/telegram/menu";
import {
  downloadTelegramFile,
  getTelegramFileUrl,
  sendChatAction,
  sendTelegramMessage,
  verifyTelegramWebhookRequest,
} from "@/lib/telegram/client";
import { verifyLinkToken } from "@/lib/telegram/link";

// AI tool loops can run a long time. We `await` the full handler before
// returning 200 (see below) so the heavy work must stay under this cap.
// Telegram will keep the webhook connection open for a long request; if we
// still exceed the limit, Vercel ends the function and the user may not get
// a reply.
export const maxDuration = 300;

const HISTORY_WINDOW = 12;

/** Telegram update payload shape we care about. We treat everything else as
 *  "ignore"; the Telegram API includes a long tail of update types
 *  (channel_post, my_chat_member, …) we don't subscribe to via setWebhook. */
type TelegramChat = {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
};

type TelegramFrom = {
  id: number;
  is_bot: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

type TelegramPhotoSize = {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  width: number;
  height: number;
};

type TelegramVoice = {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
};

type TelegramMessageObject = {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramFrom;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  voice?: TelegramVoice;
  audio?: { file_id: string; mime_type?: string };
  document?: { file_id: string; mime_type?: string };
};

type TelegramCallbackQuery = {
  id: string;
  from: TelegramFrom;
  message?: TelegramMessageObject;
  data?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessageObject;
  edited_message?: TelegramMessageObject;
  callback_query?: TelegramCallbackQuery;
};

/** Simple ack — Telegram only cares about HTTP 200. */
function ackResponse(): NextResponse {
  return NextResponse.json({ ok: true });
}

/** Sanity check from a browser or `curl` — Telegram only uses POST. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "etracker-telegram-webhook",
    ts: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const requestStarted = Date.now();

  // Verify the secret first so unauthenticated callers can't even consume
  // a few cycles of JSON parsing.
  if (!verifyTelegramWebhookRequest(request)) {
    log.error("telegram.invalid_secret", {
      hasHeader: Boolean(
        request.headers.get("x-telegram-bot-api-secret-token"),
      ),
    });
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch (error) {
    log.error("telegram.bad_json", { error: serializeError(error) });
    return ackResponse();
  }

  const inboundMeta = summarizeInboundUpdate(update);
  log.info("telegram.inbound", {
    updateId: update.update_id,
    hasMessage: Boolean(update.message),
    hasEditedMessage: Boolean(update.edited_message),
    hasCallback: Boolean(update.callback_query),
    ...inboundMeta,
  });

  // IMPORTANT: On Vercel Fluid Compute, **plain fire-and-forget promises**
  // die when the response is flushed — but even `@vercel/functions`
  // `waitUntil()` proved unreliable for our Telegram pipeline: production logs
  // showed only `telegram.inbound` with HTTP 200 and *zero* follow-up logs or
  // outbound replies for linked users (the scheduled work never ran or logs
  // never flushed). The WhatsApp webhook documents the same class of issue for
  // unfenced async work (whatsapp/route.ts).
  //
  // So we **await the entire dispatch**, including the AI agent for linked
  // users, before returning `{ ok: true }`. Telegram tolerates slow webhook
  // handlers (will wait on the connection); we set `maxDuration` above to
  // match long tool loops.
  try {
    await dispatchLight(update);
  } catch (error) {
    log.error("telegram.dispatch_error", { error: serializeError(error) });
  }

  log.info("telegram.request_complete", {
    updateId: update.update_id,
    ms: Date.now() - requestStarted,
  });

  return ackResponse();
}

/** Full inbound pipeline — must finish before we ack Telegram. */
async function dispatchLight(update: TelegramUpdate) {
  if (update.callback_query) {
    log.info("telegram.dispatch_route", {
      updateId: update.update_id,
      route: "callback_query",
      callbackDataPreview: previewText(
        update.callback_query.data ?? "",
        64,
      ),
    });
    await handleCallback(update.callback_query);
    return;
  }
  const message = update.message ?? update.edited_message;
  if (!message) {
    log.warn("telegram.dispatch_skip", {
      updateId: update.update_id,
      reason: "no_message_body",
    });
    return;
  }

  const chatType = message.chat.type;

  // Group support is a planned follow-up. For now we politely decline so
  // users that drop the bot into a group know what's going on, but only
  // when the bot is explicitly addressed (mention or reply) — otherwise we
  // ignore to avoid spamming groups.
  if (chatType !== "private") {
    const addressed = isAddressedToBot(message);
    log.info("telegram.dispatch_route", {
      updateId: update.update_id,
      route: "non_private",
      chatType,
      addressedToBot: addressed,
    });
    if (addressed) {
      await sendTelegramMessage(
        message.chat.id,
        getTelegramStrings(await chatLocaleHint(message)).groupNotice,
      );
    }
    return;
  }

  log.info("telegram.dispatch_route", {
    updateId: update.update_id,
    route: "private_message",
    chatId: String(message.chat.id),
    fromId: message.from?.id,
  });

  await handlePrivateMessage(message);
}

async function handlePrivateMessage(message: TelegramMessageObject) {
  const text = (message.text ?? message.caption ?? "").trim();
  const fromId = message.from?.id;

  // /start <token> is the link path. Also support a bare `/start` for
  // already-linked users so the bot greets them sensibly.
  if (text.startsWith("/start")) {
    log.info("telegram.private_path", {
      path: "start",
      fromId,
      chatId: String(message.chat.id),
      hasToken: text.trim().length > "/start".length,
    });
    await handleStart(message, text);
    return;
  }

  if (text === "/help" || text === "/menu") {
    log.info("telegram.private_path", {
      path: text === "/help" ? "help" : "menu",
      fromId,
      chatId: String(message.chat.id),
    });
    await handleMenu(message);
    return;
  }

  if (text === "/unlink") {
    log.info("telegram.private_path", {
      path: "unlink",
      fromId,
      chatId: String(message.chat.id),
    });
    await handleUnlink(message);
    return;
  }

  // Look up the linked user. If none, prompt them to link from the web.
  const linkedUser = await findUserByTelegramId(fromId);
  log.info("telegram.link_lookup", {
    fromId,
    linked: Boolean(linkedUser),
    userId: linkedUser?.id,
    textPreview: previewText(text, 80),
    textLen: text.length,
    hasPhoto: Boolean(message.photo?.length),
    hasVoice: Boolean(message.voice ?? message.audio),
  });

  if (!linkedUser) {
    log.info("telegram.reply_path", {
      kind: "welcome_not_linked",
      chatId: String(message.chat.id),
    });
    await sendTelegramMessage(
      message.chat.id,
      getTelegramStrings(await chatLocaleHint(message)).welcomeNotLinked,
    );
    log.info("telegram.outbound_sent", {
      kind: "welcome_not_linked",
      chatId: String(message.chat.id),
    });
    return;
  }

  const userId = linkedUser.id;
  log.info("telegram.reply_path", {
    kind: "linked_agent",
    userId,
    chatId: String(message.chat.id),
  });
  try {
    await respondToLinkedUser(userId, message);
    log.info("telegram.linked_handler_done", { userId });
  } catch (error) {
    log.error("telegram.linked_handler_error", {
      error: serializeError(error),
      userId,
    });
  }
}

async function handleStart(message: TelegramMessageObject, text: string) {
  const tokenPart = text.replace(/^\/start(?:@\w+)?\s*/i, "").trim();

  // Bare `/start` (no token) — if already linked, greet warmly; otherwise
  // explain how to link.
  if (!tokenPart) {
    const existing = await findUserByTelegramId(message.from?.id);
    const locale = existing
      ? await getUserLocale(existing.id)
      : await chatLocaleHint(message);
    const t = getTelegramStrings(locale);
    if (existing) {
      await sendTelegramMessage(message.chat.id, t.welcomeAlreadyLinked, {
        replyMarkup: buildMenuKeyboard(locale),
      });
    } else {
      await sendTelegramMessage(message.chat.id, t.welcomeNotLinked);
    }
    return;
  }

  const result = verifyLinkToken(tokenPart);
  const localeHint = await chatLocaleHint(message);
  if (!result.ok) {
    log.info("telegram.link_invalid", { reason: result.reason });
    await sendTelegramMessage(
      message.chat.id,
      result.reason === "expired"
        ? getTelegramStrings(localeHint).linkExpired
        : getTelegramStrings(localeHint).linkInvalid,
    );
    return;
  }

  const userId = result.userId;
  const fromId = message.from?.id;
  if (!fromId) {
    log.error("telegram.start_no_from", { chatId: message.chat.id });
    return;
  }

  await db.user.update({
    where: { id: userId },
    data: {
      telegramUserId: BigInt(fromId),
      telegramUsername: message.from?.username ?? null,
      telegramChatId: BigInt(message.chat.id),
      telegramVerifiedAt: new Date(),
    },
  });
  log.info("telegram.link_ok", { userId, telegramUserId: fromId });

  const locale = await getUserLocale(userId);
  const t = getTelegramStrings(locale);
  await sendTelegramMessage(message.chat.id, t.welcomeLinked, {
    replyMarkup: buildMenuKeyboard(locale),
  });
}

async function handleMenu(message: TelegramMessageObject) {
  const linkedUser = await findUserByTelegramId(message.from?.id);
  const locale = linkedUser
    ? await getUserLocale(linkedUser.id)
    : await chatLocaleHint(message);
  const t = getTelegramStrings(locale);
  if (!linkedUser) {
    await sendTelegramMessage(message.chat.id, t.welcomeNotLinked);
    return;
  }
  await sendTelegramMessage(message.chat.id, t.menuTitle, {
    replyMarkup: buildMenuKeyboard(locale),
  });
}

async function handleUnlink(message: TelegramMessageObject) {
  const linkedUser = await findUserByTelegramId(message.from?.id);
  if (!linkedUser) {
    await sendTelegramMessage(
      message.chat.id,
      getTelegramStrings(await chatLocaleHint(message)).welcomeNotLinked,
    );
    return;
  }
  const locale = await getUserLocale(linkedUser.id);
  await db.user.update({
    where: { id: linkedUser.id },
    data: {
      telegramUserId: null,
      telegramUsername: null,
      telegramChatId: null,
      telegramVerifiedAt: null,
    },
  });
  await sendTelegramMessage(
    message.chat.id,
    getTelegramStrings(locale).unlinkDone,
  );
}

async function handleCallback(callback: TelegramCallbackQuery) {
  if (!callback.message || !callback.data) {
    log.warn("telegram.callback_skip", {
      hasMessage: Boolean(callback.message),
      hasData: Boolean(callback.data),
    });
    return;
  }
  const linkedUser = await findUserByTelegramId(callback.from.id);
  log.info("telegram.callback_lookup", {
    fromId: callback.from.id,
    linked: Boolean(linkedUser),
    dataPreview: previewText(callback.data, 64),
  });

  if (!linkedUser) {
    await sendTelegramMessage(
      callback.message.chat.id,
      getTelegramStrings(await chatLocaleHint(callback.message)).welcomeNotLinked,
    );
    log.info("telegram.outbound_sent", {
      kind: "welcome_not_linked_callback",
      chatId: String(callback.message.chat.id),
    });
    return;
  }
  const locale = await getUserLocale(linkedUser.id);
  const prompt = callbackToPrompt(callback.data, locale);
  if (!prompt) {
    log.warn("telegram.callback_no_prompt", {
      dataPreview: previewText(callback.data, 64),
      locale,
    });
    return;
  }
  // We translate the menu tap into a user-typed prompt so the AI sees the
  // same shape it would for a normal message — no parallel router.
  const userId = linkedUser.id;
  const chatId = callback.message.chat.id;
  log.info("telegram.callback_agent", { userId, promptPreview: previewText(prompt, 80) });
  try {
    await respondToLinkedUserText(userId, chatId, prompt);
    log.info("telegram.callback_handler_done", { userId });
  } catch (error) {
    log.error("telegram.callback_handler_error", {
      error: serializeError(error),
      userId,
    });
  }
}

async function respondToLinkedUser(
  userId: string,
  message: TelegramMessageObject,
) {
  const locale = await getUserLocale(userId);
  const t = getTelegramStrings(locale);
  const text = (message.text ?? message.caption ?? "").trim();

  // Photo: take the largest variant Telegram returned.
  if (message.photo && message.photo.length > 0) {
    log.info("telegram.respond_branch", {
      userId,
      branch: "photo",
      captionLen: text.length,
    });
    const largest = message.photo[message.photo.length - 1];
    const fileUrl = await getTelegramFileUrl(largest.file_id);
    if (!fileUrl) {
      await sendTelegramMessage(message.chat.id, t.imageDownloadFailed);
      return;
    }
    const media = await downloadTelegramFile(fileUrl);
    if (!media) {
      await sendTelegramMessage(message.chat.id, t.imageDownloadFailed);
      return;
    }
    await respondToLinkedUserText(userId, message.chat.id, text || t.processThisCapture, {
      mediaType: media.mediaType,
      buffer: media.buffer,
    });
    return;
  }

  // Voice / audio: transcribe with Whisper, then forward as text.
  const audio = message.voice ?? message.audio;
  if (audio) {
    log.info("telegram.respond_branch", { userId, branch: "voice_or_audio" });
    const fileUrl = await getTelegramFileUrl(audio.file_id);
    if (!fileUrl) {
      await sendTelegramMessage(message.chat.id, t.audioDownloadFailed);
      return;
    }
    const media = await downloadTelegramFile(fileUrl);
    if (!media) {
      await sendTelegramMessage(message.chat.id, t.audioDownloadFailed);
      return;
    }
    const transcription = await transcribeAudioOpenAI({
      buffer: media.buffer,
      mediaType: audio.mime_type ?? media.mediaType,
      locale,
    });
    if (!transcription.ok) {
      await sendTelegramMessage(message.chat.id, transcription.message);
      return;
    }
    const combined =
      text ?
        `${text}\n\n(${t.voiceNotePrefix}: ${transcription.text})`
      : transcription.text;
    await respondToLinkedUserText(userId, message.chat.id, combined);
    return;
  }

  if (message.document) {
    log.info("telegram.respond_branch", { userId, branch: "document_unsupported" });
    await sendTelegramMessage(message.chat.id, t.unsupportedMedia);
    return;
  }

  if (text) {
    log.info("telegram.respond_branch", {
      userId,
      branch: "text",
      textPreview: previewText(text, 80),
    });
    await respondToLinkedUserText(userId, message.chat.id, text);
    return;
  }

  log.warn("telegram.respond_empty", {
    userId,
    chatId: String(message.chat.id),
    hint:
      "No text/caption and no photo/voice — sticker or unsupported content?",
  });
}

async function respondToLinkedUserText(
  userId: string,
  chatId: number,
  text: string,
  image?: { mediaType: string; buffer: Buffer },
) {
  const pipelineStarted = Date.now();
  const locale = await getUserLocale(userId);
  const t = getTelegramStrings(locale);

  const quota = await consumeAgentQuota(userId);
  log.info("telegram.agent_quota", {
    userId,
    ok: quota.ok,
    ...(quota.ok ?
      {
        used: quota.used,
        limit: quota.limit,
        remaining: quota.remaining,
      }
    : quota.reason === "limit" ?
      {
        reason: "limit" as const,
        used: quota.used,
        limit: quota.limit,
      }
    : { reason: "disabled" as const }),
  });

  if (!quota.ok) {
    if (quota.reason === "disabled") {
      await sendTelegramMessage(chatId, t.accountDisabled);
      log.info("telegram.outbound_sent", {
        kind: "quota_disabled",
        chatId: String(chatId),
      });
      return;
    }
    await sendTelegramMessage(chatId, quotaLimitMessage(locale, quota.limit));
    log.info("telegram.outbound_sent", {
      kind: "quota_exhausted",
      chatId: String(chatId),
    });
    return;
  }

  // Show the typing indicator so the chat feels live while the AI runs.
  await sendChatAction(chatId, "typing");

  const history = await loadHistory(userId);
  log.info("telegram.agent_start", {
    userId,
    historyTurns: history.length,
    hasImage: Boolean(image),
    textPreview: previewText(text, 80),
  });

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

  await persistMessage(userId, "user", text || t.imagePlaceholder, chatId);

  let reply = "";
  let modelUsed = "";
  try {
    const aiStarted = Date.now();
    const result = await generateExpenseAgentReply({
      userId,
      messages: [...history, userMessage],
      source: "telegram",
    });
    reply = result.text;
    modelUsed = result.model;
    log.info("telegram.agent_model_done", {
      userId,
      ms: Date.now() - aiStarted,
      model: result.model,
      replyLen: reply.length,
      usage: result.usage,
    });
    await Promise.all([
      recordAgentTokens(userId, result.usage),
      recordAgentModelUsage(userId, result.model, result.usage),
    ]);
  } catch (error) {
    log.error("telegram.agent_error", { error: serializeError(error) });
    reply = t.agentError;
  }

  if (quota.remaining > 0 && quota.remaining <= 3 && reply) {
    reply = `${reply}\n\n${lowQuotaHint(locale, quota.remaining)}`;
  }

  await persistMessage(userId, "assistant", reply, chatId);

  await sendTelegramMessage(chatId, reply, {
    disableWebPagePreview: true,
  });

  log.info("telegram.outbound_sent", {
    kind: "assistant_reply",
    chatId: String(chatId),
    model: modelUsed || undefined,
    replyLen: reply.length,
    pipelineMs: Date.now() - pipelineStarted,
  });
}

async function loadHistory(userId: string): Promise<ModelMessage[]> {
  const rows = await db.telegramMessage.findMany({
    where: { userId, isGroup: false },
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
  chatId: number,
) {
  await db.telegramMessage.create({
    data: {
      userId,
      role,
      text: text.slice(0, 4000),
      chatId: BigInt(chatId),
      isGroup: false,
    },
  });
}

async function findUserByTelegramId(
  telegramUserId: number | undefined,
): Promise<{ id: string } | null> {
  if (!telegramUserId) return null;
  return db.user.findUnique({
    where: { telegramUserId: BigInt(telegramUserId) },
    select: { id: true },
  });
}

async function getUserLocale(userId: string): Promise<Locale> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { locale: true },
  });
  return isLocale(u?.locale) ? (u!.locale as Locale) : "es";
}

/** Best-effort locale guess for unlinked chats: use the Telegram client's
 *  `language_code` (e.g. "es-AR", "en") if the user provided one. */
async function chatLocaleHint(message: TelegramMessageObject): Promise<Locale> {
  const code = message.from?.language_code?.toLowerCase() ?? "";
  if (code.startsWith("en")) return "en";
  return "es";
}

function isAddressedToBot(message: TelegramMessageObject): boolean {
  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  if (!username) return false;
  const text = message.text ?? message.caption ?? "";
  return text.includes(`@${username}`);
}

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

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return error;
}

/** Redacted one-line preview for logs (no raw newlines). */
function previewText(value: string, max = 72): string {
  const oneLine = value.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max)}…`;
}

/** Extra fields for `telegram.inbound` so we can grep a single line in Vercel. */
function summarizeInboundUpdate(update: TelegramUpdate): Record<string, unknown> {
  const msg = update.message ?? update.edited_message;
  const text = (msg?.text ?? msg?.caption ?? "").trim();
  return {
    chatType: msg?.chat.type,
    chatId: msg ? String(msg.chat.id) : undefined,
    fromId: msg?.from?.id,
    isBot: msg?.from?.is_bot,
    textLen: text.length,
    textPreview: text ? previewText(text, 64) : undefined,
    hasPhoto: Boolean(msg?.photo?.length),
    hasVoice: Boolean(msg?.voice ?? msg?.audio),
    hasDocument: Boolean(msg?.document),
  };
}
