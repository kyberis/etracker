import { type ModelMessage } from "ai";
import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";

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

// AI tool loops can exceed the default 10s on Hobby/Pro. Mirror the WhatsApp
// webhook so long replies don't get cut off.
export const maxDuration = 60;

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

  log.info("telegram.inbound", {
    updateId: update.update_id,
    hasMessage: Boolean(update.message),
    hasEditedMessage: Boolean(update.edited_message),
    hasCallback: Boolean(update.callback_query),
  });

  // IMPORTANT: On Vercel, `waitUntil` / fire-and-forget promises are not
  // reliable for short outbound calls — the isolate is frozen right after the
  // response is sent and the deferred work silently dies (we observed this
  // on the WhatsApp webhook too; see whatsapp/route.ts for the post-mortem).
  //
  // Strategy:
  //   - Lightweight paths (/start <token>, /help, /menu, /unlink, unlinked
  //     welcome, group notice) → run inline before we respond. They're a
  //     single DB read/write + one Telegram sendMessage, usually <1s, well
  //     within Telegram's webhook timeout.
  //   - Heavy AI path (free-form messages from linked users, photos, voice
  //     notes) → schedule via `waitUntil` so we ack Telegram fast and don't
  //     get retried while the model runs.
  try {
    await dispatchLight(update);
  } catch (error) {
    log.error("telegram.dispatch_error", { error: serializeError(error) });
  }

  return ackResponse();
}

/**
 * Run everything that must complete before the HTTP response is flushed.
 * For the AI-heavy path this also enqueues the slow work via `waitUntil`.
 */
async function dispatchLight(update: TelegramUpdate) {
  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }
  const message = update.message ?? update.edited_message;
  if (!message) return;

  const chatType = message.chat.type;

  // Group support is a planned follow-up. For now we politely decline so
  // users that drop the bot into a group know what's going on, but only
  // when the bot is explicitly addressed (mention or reply) — otherwise we
  // ignore to avoid spamming groups.
  if (chatType !== "private") {
    if (isAddressedToBot(message)) {
      await sendTelegramMessage(
        message.chat.id,
        getTelegramStrings(await chatLocaleHint(message)).groupNotice,
      );
    }
    return;
  }

  await handlePrivateMessage(message);
}

async function handlePrivateMessage(message: TelegramMessageObject) {
  const text = (message.text ?? message.caption ?? "").trim();

  // /start <token> is the link path. Also support a bare `/start` for
  // already-linked users so the bot greets them sensibly.
  if (text.startsWith("/start")) {
    await handleStart(message, text);
    return;
  }

  if (text === "/help" || text === "/menu") {
    await handleMenu(message);
    return;
  }

  if (text === "/unlink") {
    await handleUnlink(message);
    return;
  }

  // Look up the linked user. If none, prompt them to link from the web.
  const linkedUser = await findUserByTelegramId(message.from?.id);
  if (!linkedUser) {
    await sendTelegramMessage(
      message.chat.id,
      getTelegramStrings(await chatLocaleHint(message)).welcomeNotLinked,
    );
    return;
  }

  // The AI agent path can take 10–30s. Schedule it via `waitUntil` and ack
  // Telegram immediately so it doesn't retry while the model is running.
  // Capture the userId in a stable local; `linkedUser` is closed over but the
  // outer request promise will resolve before this finishes.
  const userId = linkedUser.id;
  waitUntil(
    (async () => {
      try {
        await respondToLinkedUser(userId, message);
      } catch (error) {
        log.error("telegram.linked_handler_error", {
          error: serializeError(error),
        });
      }
    })(),
  );
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
  if (!callback.message || !callback.data) return;
  const linkedUser = await findUserByTelegramId(callback.from.id);
  if (!linkedUser) {
    await sendTelegramMessage(
      callback.message.chat.id,
      getTelegramStrings(await chatLocaleHint(callback.message)).welcomeNotLinked,
    );
    return;
  }
  const locale = await getUserLocale(linkedUser.id);
  const prompt = callbackToPrompt(callback.data, locale);
  if (!prompt) return;
  // We translate the menu tap into a user-typed prompt so the AI sees the
  // same shape it would for a normal message — no parallel router. The model
  // call is the slow part, so defer it via `waitUntil`.
  const userId = linkedUser.id;
  const chatId = callback.message.chat.id;
  waitUntil(
    (async () => {
      try {
        await respondToLinkedUserText(userId, chatId, prompt);
      } catch (error) {
        log.error("telegram.callback_handler_error", {
          error: serializeError(error),
        });
      }
    })(),
  );
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
    await sendTelegramMessage(message.chat.id, t.unsupportedMedia);
    return;
  }

  if (text) {
    await respondToLinkedUserText(userId, message.chat.id, text);
  }
}

async function respondToLinkedUserText(
  userId: string,
  chatId: number,
  text: string,
  image?: { mediaType: string; buffer: Buffer },
) {
  const locale = await getUserLocale(userId);
  const t = getTelegramStrings(locale);

  const quota = await consumeAgentQuota(userId);
  if (!quota.ok) {
    if (quota.reason === "disabled") {
      await sendTelegramMessage(chatId, t.accountDisabled);
      return;
    }
    await sendTelegramMessage(chatId, quotaLimitMessage(locale, quota.limit));
    return;
  }

  // Show the typing indicator so the chat feels live while the AI runs.
  await sendChatAction(chatId, "typing");

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

  await persistMessage(userId, "user", text || t.imagePlaceholder, chatId);

  let reply = "";
  try {
    const result = await generateExpenseAgentReply({
      userId,
      messages: [...history, userMessage],
      source: "telegram",
    });
    reply = result.text;
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
