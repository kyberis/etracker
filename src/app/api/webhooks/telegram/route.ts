import { type ModelMessage } from "ai";
import { NextResponse } from "next/server";

import { generateExpenseAgentReply } from "@/lib/ai/run-expense-agent";
import { transcribeAudioOpenAI } from "@/lib/ai/transcribe-audio";
import { dataUrlToBuffer, extractPdf } from "@/lib/pdf-extract";
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
  deleteTelegramMessage,
  downloadTelegramFile,
  editTelegramMessage,
  getTelegramFileUrl,
  sendChatAction,
  sendTelegramChartsThenHtmlMessage,
  sendTelegramMessage,
  sendTelegramStatusMessage,
  verifyTelegramWebhookRequest,
} from "@/lib/telegram/client";
import {
  initialThinkingLabel,
  toolProgressLabel,
} from "@/lib/telegram/tool-progress";
import { verifyLinkToken } from "@/lib/telegram/link";
import {
  existingUserSharedEventWelcome,
  guestWelcomeMessage,
} from "@/lib/telegram/event-share-strings";
import {
  lowQuotaHint,
  pdfExtractedMarkdownHeading,
  pdfScanOnlyMarkdownNote,
  quotaLimitMessage,
} from "@/lib/telegram/embedded-markdown";
import {
  loadTelegramSetupHint,
  type TelegramSetupHint,
} from "@/lib/telegram/setup-state";
import { buildIdpUpgradeUrlForClara, shouldSendUsersToUnifiedIdp } from "@/lib/idp-base";
import { idpRegisterTelegramUser, idpResolveSubForTelegramUser } from "@/lib/idp-telegram";
import { loadGuestEventScope } from "@/lib/telegram/event-guest-state";

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

type TelegramDocument = {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
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
  document?: TelegramDocument;
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
  // never flushed).
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

/** Persist Telegram identity + welcome message after a successful `/start` link. */
async function completeTelegramLink(
  userId: string,
  message: TelegramMessageObject,
  via: "short_code" | "signed_token",
) {
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
      telegramLinkCode: null,
      telegramLinkCodeExpires: null,
    },
  });
  const withSub = await db.user.findUnique({
    where: { id: userId },
    select: { idpSub: true },
  });
  if (withSub?.idpSub) {
    await idpRegisterTelegramUser(fromId, withSub.idpSub);
  }
  log.info("telegram.link_ok", {
    userId,
    telegramUserId: fromId,
    via,
  });

  const locale = await getUserLocale(userId);
  const t = getTelegramStrings(locale);

  // If the account hasn't been set up yet (no confirmed currency, no income
  // and no expense in the current month), let the AI drive the welcome
  // instead of the static `welcomeLinked` string. The agent receives the
  // setup hint and replies with a warm greeting + 3-4 example prompts the
  // user can tap or rewrite. Falls back to the static welcome on failure
  // so the user is never left in silence.
  let setupHint: TelegramSetupHint | null = null;
  try {
    setupHint = await loadTelegramSetupHint(userId);
  } catch (error) {
    log.error("telegram.setup_hint_error", {
      error: serializeError(error),
      userId,
      stage: "complete_link",
    });
  }

  if (setupHint?.needsSetup) {
    log.info("telegram.first_run_kickoff", {
      userId,
      currencyConfirmed: setupHint.currencyConfirmed,
      hasIncomeThisMonth: setupHint.hasIncomeThisMonth,
      hasExpenseThisMonth: setupHint.hasExpenseThisMonth,
    });
    try {
      await respondToLinkedUserText(
        userId,
        message.chat.id,
        t.setupKickoffPrompt,
        undefined,
        setupHint,
      );
      return;
    } catch (error) {
      log.error("telegram.first_run_kickoff_error", {
        error: serializeError(error),
        userId,
      });
      // Fall through to the static welcome below.
    }
  }

  await sendTelegramMessage(message.chat.id, t.welcomeLinked, {
    replyMarkup: buildMenuKeyboard(locale),
  });
}

/**
 * Complete a Telegram link for a user who joined a shared event via the
 * web landing. Differs from `completeTelegramLink` in two ways:
 *   1. The welcome message is event-aware ("Marcos te invitó a Mendoza
 *      Trip") and skips the regular onboarding kickoff (those tools
 *      aren't available to GUESTs anyway).
 *   2. We clear the EventParticipant.telegramLinkCode (single-use) and
 *      do NOT touch User.telegramLinkCode (might be set for an unrelated
 *      regular-link flow on the same account).
 *
 * For REGULAR users who accepted via "logged-in" branch, this also
 * runs but uses the existing-user welcome string.
 */
async function completeEventParticipantLink(
  participant: {
    userId: string;
    eventId: string;
    displayName: string;
    event: {
      name: string;
      user: { name: string | null; email: string };
    };
  },
  message: TelegramMessageObject,
) {
  const fromId = message.from?.id;
  if (!fromId) {
    log.error("telegram.event_participant_no_from", { chatId: message.chat.id });
    return;
  }

  // Update the User's Telegram identity AND clear the participant's
  // single-use link code in one transaction. We don't read User.kind
  // here because either flavor (REGULAR re-confirming, or GUEST first
  // ever Telegram contact) needs identity bound to the chat.
  await db.$transaction([
    db.user.update({
      where: { id: participant.userId },
      data: {
        telegramUserId: BigInt(fromId),
        telegramUsername: message.from?.username ?? null,
        telegramChatId: BigInt(message.chat.id),
        telegramVerifiedAt: new Date(),
      },
    }),
    db.eventParticipant.update({
      where: {
        eventId_userId: {
          eventId: participant.eventId,
          userId: participant.userId,
        },
      },
      data: { telegramLinkCode: null },
    }),
  ]);

  const subRow = await db.user.findUnique({
    where: { id: participant.userId },
    select: { idpSub: true },
  });
  if (subRow?.idpSub) {
    await idpRegisterTelegramUser(fromId, subRow.idpSub);
  }

  log.info("telegram.event_participant_linked", {
    userId: participant.userId,
    eventId: participant.eventId,
    telegramUserId: fromId,
  });

  const locale = await getUserLocale(participant.userId);
  const ownerName = pickOwnerNameForChat(participant.event.user);

  // GUEST → tailored guest welcome (sets expectations: only this event,
  //         we'll ask "who paid", upgrade later).
  // REGULAR → "you joined X" reminder so they know the bot scope just
  //           expanded to include this trip.
  const user = await db.user.findUnique({
    where: { id: participant.userId },
    select: { kind: true },
  });
  const text =
    user?.kind === "GUEST"
      ? guestWelcomeMessage(locale, {
          ownerDisplayName: ownerName,
          eventName: participant.event.name,
        })
      : existingUserSharedEventWelcome(locale, {
          ownerDisplayName: ownerName,
          eventName: participant.event.name,
        });

  await sendTelegramMessage(message.chat.id, text);
}

function pickOwnerNameForChat(
  user: { name: string | null; email: string },
): string {
  if (user.name && user.name.trim().length > 0) return user.name.trim();
  return user.email.split("@")[0] || "tu organizador";
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

  const localeHint = await chatLocaleHint(message);

  // ---- Shared event wallets: GUEST link codes -------------------------
  //
  // The share-link landing creates `EventParticipant` rows with a
  // `telegramLinkCode`. When the freshly-minted GUEST taps the t.me
  // deep link with that code, we look it up here, attach Telegram
  // identity to the User the participant points at, and send the
  // event-aware welcome instead of the regular onboarding kickoff.
  const participantByCode = await db.eventParticipant.findUnique({
    where: { telegramLinkCode: tokenPart },
    select: {
      userId: true,
      eventId: true,
      displayName: true,
      removedAt: true,
      event: {
        select: {
          name: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
  });
  if (participantByCode && !participantByCode.removedAt) {
    await completeEventParticipantLink(
      participantByCode,
      message,
    );
    return;
  }

  const linkedByCode = await db.user.findFirst({
    where: {
      telegramLinkCode: tokenPart,
      telegramLinkCodeExpires: { gt: new Date() },
    },
    select: { id: true },
  });

  if (linkedByCode) {
    await completeTelegramLink(linkedByCode.id, message, "short_code");
    return;
  }

  const result = verifyLinkToken(tokenPart);
  if (!result.ok) {
    log.info("telegram.link_invalid", {
      reason: result.reason,
      tokenLen: tokenPart.length,
    });
    await sendTelegramMessage(
      message.chat.id,
      result.reason === "expired"
        ? getTelegramStrings(localeHint).linkExpired
        : getTelegramStrings(localeHint).linkInvalid,
    );
    return;
  }

  await completeTelegramLink(result.userId, message, "signed_token");
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
    await respondToLinkedUserText(userId, message.chat.id, text || t.processThisCapture, [
      {
        mediaType: media.mediaType,
        buffer: media.buffer,
      },
    ]);
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
    const isPdf = isPdfDocument(message.document);
    log.info("telegram.respond_branch", {
      userId,
      branch: isPdf ? "pdf" : "document_unsupported",
      mimeType: message.document.mime_type,
      filename: message.document.file_name,
    });
    if (!isPdf) {
      await sendTelegramMessage(message.chat.id, t.unsupportedMedia);
      return;
    }
    await handlePdfDocument(userId, message);
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
  images?: { mediaType: string; buffer: Buffer }[],
  precomputedSetupHint?: TelegramSetupHint,
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
    let idpUpgradeUrl: string | undefined;
    if (shouldSendUsersToUnifiedIdp()) {
      const row = await db.user.findUnique({
        where: { id: userId },
        select: { idpSub: true },
      });
      idpUpgradeUrl = buildIdpUpgradeUrlForClara(row?.idpSub ?? null);
    }
    await sendTelegramMessage(
      chatId,
      quotaLimitMessage(locale, quota.limit, { idpUpgradeUrl }),
    );
    log.info("telegram.outbound_sent", {
      kind: "quota_exhausted",
      chatId: String(chatId),
    });
    return;
  }

  // Show the typing indicator so the chat feels live while the AI runs,
  // then post a single short "status" message we can edit in place as the
  // agent calls each tool. If the send fails we fall back to typing only —
  // the agent still runs to completion.
  await sendChatAction(chatId, "typing");
  const status = await sendTelegramStatusMessage(
    chatId,
    initialThinkingLabel(locale),
  );
  let lastStatusText = initialThinkingLabel(locale);

  const history = await loadHistory(userId);

  // Load the setup hint (if not already pre-computed by the caller). When
  // `needsSetup` is true the agent gets an extra system-prompt block that
  // turns the turn into a guided onboarding step.
  let setupHint: TelegramSetupHint | undefined = precomputedSetupHint;
  if (!setupHint) {
    try {
      setupHint = await loadTelegramSetupHint(userId);
    } catch (error) {
      log.error("telegram.setup_hint_error", {
        error: serializeError(error),
        userId,
        stage: "respond",
      });
      setupHint = undefined;
    }
  }

  // Shared event scope (only set for `User.kind = GUEST`). When present,
  // the agent gets a tightly scoped system prompt and a filtered toolset
  // that locks every operation to the single event the guest was invited
  // to. `loadGuestEventScope` returns null for REGULAR users so this is
  // a free no-op outside the shared-events flow.
  let guestEventScope = undefined;
  try {
    const scope = await loadGuestEventScope(userId);
    if (scope) guestEventScope = scope;
  } catch (error) {
    log.error("telegram.guest_scope_error", {
      error: serializeError(error),
      userId,
    });
  }

  log.info("telegram.agent_start", {
    userId,
    historyTurns: history.length,
    imageCount: images?.length ?? 0,
    textPreview: previewText(text, 80),
    needsSetup: Boolean(setupHint?.needsSetup),
    guestScope: guestEventScope ? guestEventScope.eventId : null,
  });

  const userMessage: ModelMessage =
    images && images.length > 0
      ? {
          role: "user",
          content: [
            { type: "text", text: text || t.processThisCapture },
            ...images.map((img) => ({
              type: "image" as const,
              image: img.buffer,
              mediaType: img.mediaType,
            })),
          ],
        }
      : { role: "user", content: text };

  await persistMessage(
    userId,
    "user",
    text || (images && images.length > 0 ? t.imagePlaceholder : ""),
    chatId,
  );

  let reply = "";
  let chartImageUrls: string[] = [];
  let modelUsed = "";
  try {
    const aiStarted = Date.now();
    const result = await generateExpenseAgentReply({
      userId,
      messages: [...history, userMessage],
      source: "telegram",
      setupHint,
      guestEventScope,
      onStep: status
        ? async ({ toolNames }) => {
            if (toolNames.length === 0) return;
            // Show the most recently invoked tool. If the same tool ran
            // twice in a row Telegram returns "message is not modified",
            // which `editTelegramMessage` swallows.
            const next = toolProgressLabel(toolNames[toolNames.length - 1]!, locale);
            if (next === lastStatusText) return;
            lastStatusText = next;
            await editTelegramMessage(chatId, status.messageId, next);
          }
        : undefined,
    });
    reply = result.text;
    chartImageUrls = result.chartImageUrls;
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

  // Replace the status message with the final reply. Delete-then-send
  // (vs editing in place) keeps chart photos, HTML formatting and inline
  // keyboards working uniformly through `sendTelegramChartsThenHtmlMessage`.
  if (status) {
    await deleteTelegramMessage(chatId, status.messageId);
  }
  await sendTelegramChartsThenHtmlMessage(chatId, {
    text: reply,
    chartImageUrls,
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

/** Cap to keep extracted PDF text from blowing the prompt context. */
const TELEGRAM_PDF_MAX_BYTES = 12 * 1024 * 1024;

function isPdfDocument(doc: TelegramDocument): boolean {
  if (doc.mime_type === "application/pdf" || doc.mime_type === "application/x-pdf") {
    return true;
  }
  return Boolean(doc.file_name && doc.file_name.toLowerCase().endsWith(".pdf"));
}

/**
 * Handle a PDF document attachment. Mirrors the web `/api/chat/extract-pdf`
 * pipeline: pull text when there's a text layer, fall back to rendering the
 * first 1-2 pages as PNG when it's a scan, then forward both to the agent
 * with the same caption-style intro the web composer uses.
 */
async function handlePdfDocument(
  userId: string,
  message: TelegramMessageObject,
): Promise<void> {
  const doc = message.document!;
  const locale = await getUserLocale(userId);
  const t = getTelegramStrings(locale);
  const caption = (message.text ?? message.caption ?? "").trim();

  if (doc.file_size && doc.file_size > TELEGRAM_PDF_MAX_BYTES) {
    await sendTelegramMessage(message.chat.id, t.pdfTooLarge);
    return;
  }

  await sendChatAction(message.chat.id, "typing");

  const fileUrl = await getTelegramFileUrl(doc.file_id);
  if (!fileUrl) {
    await sendTelegramMessage(message.chat.id, t.pdfDownloadFailed);
    return;
  }
  const media = await downloadTelegramFile(fileUrl);
  if (!media) {
    await sendTelegramMessage(message.chat.id, t.pdfDownloadFailed);
    return;
  }

  let extracted: { text?: string; images?: { dataUrl: string; pageNumber: number }[] };
  try {
    extracted = await extractPdf(media.buffer);
  } catch (error) {
    log.error("telegram.pdf_extract_error", {
      error: serializeError(error),
      userId,
    });
    await sendTelegramMessage(message.chat.id, t.pdfExtractFailed);
    return;
  }

  if (!extracted.text && (!extracted.images || extracted.images.length === 0)) {
    await sendTelegramMessage(message.chat.id, t.pdfExtractFailed);
    return;
  }

  const filename = doc.file_name ?? "document.pdf";
  const intro = t.pdfAttachmentIntro;
  const textBlocks: string[] = [];
  if (extracted.text) {
    textBlocks.push(
      pdfExtractedMarkdownHeading(locale, filename, extracted.text),
    );
  } else if (extracted.images?.length) {
    textBlocks.push(
      pdfScanOnlyMarkdownNote(
        locale,
        filename,
        extracted.images.length,
      ),
    );
  }

  const composedText = [caption, intro, textBlocks.join("\n\n---\n\n")]
    .filter((s) => s.length > 0)
    .join("\n\n");

  const images: { mediaType: string; buffer: Buffer }[] = [];
  if (extracted.images?.length) {
    for (const page of extracted.images) {
      const decoded = dataUrlToBuffer(page.dataUrl);
      if (decoded) images.push(decoded);
    }
  }

  await respondToLinkedUserText(
    userId,
    message.chat.id,
    composedText,
    images.length > 0 ? images : undefined,
  );
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
  // We don't filter by `isActive`/`deletedAt` here on purpose: those are
  // re-checked inside `consumeAgentQuota` which fails closed with the
  // `accountDisabled` reply, so soft-deleted accounts never get a model
  // call but the bot still has the chance to react to a known link.
  const local = await db.user.findUnique({
    where: { telegramUserId: BigInt(telegramUserId) },
    select: { id: true },
  });
  if (local) return local;

  const idpSub = await idpResolveSubForTelegramUser(telegramUserId);
  if (!idpSub) return null;
  return db.user.findFirst({
    where: { idpSub },
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
