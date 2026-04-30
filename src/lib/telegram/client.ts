/**
 * Thin wrapper over the Telegram Bot API used by the inbound webhook and the
 * outbound reply path. Mirrors the shape of `lib/whatsapp/twilio.ts` (small,
 * dependency-free, throws on missing env) so the two channels feel familiar.
 *
 * Auth model: Telegram authenticates outbound calls with the bot token in the
 * URL (`/bot<token>/...`) and authenticates the webhook by sending back the
 * secret we registered via `setWebhook` in the
 * `X-Telegram-Bot-Api-Secret-Token` header.
 */

import { formatAgentMarkdownForTelegramHtml } from "@/lib/messaging/format-outbound";
import { log } from "@/lib/log";
import {
  chunkTelegramHtmlForSend,
  stripTelegramBoldTags,
} from "@/lib/telegram/chunk-html";

const TELEGRAM_API_BASE = "https://api.telegram.org";

/** Hard cap Telegram enforces on `sendMessage.text`. We segment longer replies. */
const MAX_MESSAGE_LENGTH = 4096;

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }
  return token;
}

/** Inline keyboard button shape Telegram accepts under `reply_markup`. */
export type InlineKeyboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

export type InlineKeyboardMarkup = {
  inline_keyboard: InlineKeyboardButton[][];
};

export type SendTelegramMessageOptions = {
  /** Markdown-style formatting. We use `MarkdownV2` because it's the safest
   *  superset; callers must escape user-controlled text themselves if they
   *  pass it raw. By default we send plain text. */
  parseMode?: "MarkdownV2" | "HTML";
  /** Inline keyboard rendered under the message bubble. */
  replyMarkup?: InlineKeyboardMarkup;
  /** Suppress the link preview (cleaner output for AI replies). */
  disableWebPagePreview?: boolean;
};

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
};

async function callTelegram<T>(
  method: string,
  body: Record<string, unknown>,
): Promise<TelegramApiResponse<T>> {
  const token = getBotToken();
  const url = `${TELEGRAM_API_BASE}/bot${token}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json()) as TelegramApiResponse<T>;
  if (!data.ok) {
    log.error("telegram.api_error", {
      method,
      errorCode: data.error_code,
      description: data.description,
    });
  }
  return data;
}

/**
 * Send a plain-text Telegram message. Telegram caps each message at 4096
 * chars; we segment the input the same way the Twilio client does so long
 * AI replies still arrive.
 */
export async function sendTelegramMessage(
  chatId: number | bigint,
  text: string,
  opts?: SendTelegramMessageOptions,
): Promise<void> {
  const chunks = chunkText(text || "(sin respuesta)", MAX_MESSAGE_LENGTH);
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const body: Record<string, unknown> = {
      chat_id: chatId.toString(),
      text: chunks[i],
    };
    if (opts?.parseMode) body.parse_mode = opts.parseMode;
    if (opts?.disableWebPagePreview) body.disable_web_page_preview = true;
    // Only attach the keyboard to the final segment so the user sees the
    // buttons under the closing message, not under each fragment.
    if (isLast && opts?.replyMarkup) body.reply_markup = opts.replyMarkup;

    const result = await callTelegram<{ message_id: number }>(
      "sendMessage",
      body,
    );
    if (!result.ok) {
      throw new Error(
        `Telegram sendMessage failed: ${result.description ?? "unknown"}`,
      );
    }
  }
}

/**
 * Show the "typing…" indicator in the user's chat. Cheap to call and a no-op
 * on failure — purely cosmetic to mirror the web chat's typing dots while
 * the AI is generating.
 */
export async function sendChatAction(
  chatId: number | bigint,
  action: "typing" | "upload_photo" | "upload_voice" = "typing",
): Promise<void> {
  await callTelegram<boolean>("sendChatAction", {
    chat_id: chatId.toString(),
    action,
  }).catch(() => undefined);
}

/**
 * Resolve a `file_id` from an inbound update to a downloadable HTTPS URL.
 * Returns `null` when the API fails so callers can fall back to a friendly
 * "couldn't read the file" reply.
 */
export async function getTelegramFileUrl(
  fileId: string,
): Promise<string | null> {
  const result = await callTelegram<{ file_path: string }>("getFile", {
    file_id: fileId,
  });
  if (!result.ok || !result.result?.file_path) return null;
  const token = getBotToken();
  return `${TELEGRAM_API_BASE}/file/bot${token}/${result.result.file_path}`;
}

/**
 * Download a Telegram-hosted file (image, voice note) into memory. The URL
 * comes from `getTelegramFileUrl`; Telegram's file CDN doesn't require auth
 * once we have the path.
 */
export async function downloadTelegramFile(
  fileUrl: string,
): Promise<{ buffer: Buffer; mediaType: string } | null> {
  const res = await fetch(fileUrl, { cache: "no-store" });
  if (!res.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  const mediaType =
    res.headers.get("content-type") ?? "application/octet-stream";
  return { buffer, mediaType };
}

function truncateTelegramCaption(html: string): string {
  if (html.length <= 1024) return html;
  return `${html.slice(0, 1018)}…`;
}

/**
 * Send `sendPhoto` with an HTTPS URL (PNG/JPEG). Optional caption uses the same
 * **bold** → `<b>` conversion as HTML messages.
 */
export async function sendTelegramPhotoFromUrl(
  chatId: number | bigint,
  photoUrl: string,
  caption?: string,
): Promise<void> {
  if (!photoUrl.startsWith("https://")) return;
  const cap = caption?.trim()
    ? truncateTelegramCaption(formatAgentMarkdownForTelegramHtml(caption))
    : undefined;
  const body: Record<string, unknown> = {
    chat_id: chatId.toString(),
    photo: photoUrl,
    ...(cap ? { caption: cap, parse_mode: "HTML" } : {}),
  };
  const result = await callTelegram<{ message_id: number }>("sendPhoto", body);
  if (!result.ok) {
    throw new Error(
      `Telegram sendPhoto failed: ${result.description ?? "unknown"}`,
    );
  }
}

/**
 * Send the assistant reply as HTML so **bold** from the model renders correctly.
 */
export async function sendTelegramHtmlMessage(
  chatId: number | bigint,
  text: string,
  opts?: Omit<SendTelegramMessageOptions, "parseMode">,
): Promise<void> {
  const html = formatAgentMarkdownForTelegramHtml(text || "(sin respuesta)");
  const chunks = chunkTelegramHtmlForSend(html);
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const body: Record<string, unknown> = {
      chat_id: chatId.toString(),
      text: chunks[i],
      parse_mode: "HTML",
    };
    if (opts?.disableWebPagePreview) body.disable_web_page_preview = true;
    if (isLast && opts?.replyMarkup) body.reply_markup = opts.replyMarkup;

    let result = await callTelegram<{ message_id: number }>(
      "sendMessage",
      body,
    );
    if (!result.ok) {
      log.warn("telegram.html_send_retry_plain", {
        description: result.description,
        chunkIndex: i,
      });
      const plainBody: Record<string, unknown> = {
        chat_id: chatId.toString(),
        text: stripTelegramBoldTags(chunks[i]),
      };
      if (opts?.disableWebPagePreview) plainBody.disable_web_page_preview = true;
      if (isLast && opts?.replyMarkup) plainBody.reply_markup = opts.replyMarkup;
      result = await callTelegram<{ message_id: number }>(
        "sendMessage",
        plainBody,
      );
      if (!result.ok) {
        throw new Error(
          `Telegram sendMessage failed: ${result.description ?? "unknown"}`,
        );
      }
    }
  }
}

/** Chart PNG URLs first (same pipeline as WhatsApp), then HTML prose. */
export async function sendTelegramChartsThenHtmlMessage(
  chatId: number | bigint,
  opts: {
    text: string;
    chartImageUrls?: string[];
    disableWebPagePreview?: boolean;
    replyMarkup?: InlineKeyboardMarkup;
  },
): Promise<void> {
  const urls =
    opts.chartImageUrls?.filter((u) => u.startsWith("https://")) ?? [];
  for (const url of urls.slice(0, 10)) {
    await sendChatAction(chatId, "upload_photo");
    try {
      await sendTelegramPhotoFromUrl(chatId, url);
    } catch (error) {
      log.warn("telegram.chart_photo_skipped", {
        error: error instanceof Error ? error.message : String(error),
        urlPreview: url.slice(0, 80),
      });
    }
  }
  await sendTelegramHtmlMessage(chatId, opts.text, {
    disableWebPagePreview: opts.disableWebPagePreview,
    replyMarkup: opts.replyMarkup,
  });
}

/**
 * Register the public webhook URL Telegram should POST to. Used by the setup
 * script and (optionally) on cold start. We always pass `secret_token` so
 * the webhook handler can reject unsigned requests.
 */
export async function setTelegramWebhook(params: {
  url: string;
  secret: string;
  /** Restrict update types to keep noise down (text, photo, voice, callback). */
  allowedUpdates?: string[];
  /** Drop any updates queued before the new URL was set. */
  dropPendingUpdates?: boolean;
}): Promise<{ ok: boolean; description?: string }> {
  const result = await callTelegram<boolean>("setWebhook", {
    url: params.url,
    secret_token: params.secret,
    allowed_updates: params.allowedUpdates ?? [
      "message",
      "edited_message",
      "callback_query",
    ],
    drop_pending_updates: params.dropPendingUpdates ?? false,
  });
  return { ok: result.ok, description: result.description };
}

/**
 * Register the user-facing slash-command list shown in the Telegram menu.
 * Idempotent — Telegram replaces the list on every call.
 */
export async function setTelegramCommands(
  commands: { command: string; description: string }[],
): Promise<{ ok: boolean }> {
  const result = await callTelegram<boolean>("setMyCommands", { commands });
  return { ok: result.ok };
}

/**
 * Verify the secret Telegram echoes back in `X-Telegram-Bot-Api-Secret-Token`.
 * If `TELEGRAM_WEBHOOK_SECRET` isn't configured we fail closed: a missing
 * secret means the bot wasn't set up for this environment yet, and we'd
 * rather drop updates than process them unauthenticated.
 */
export function verifyTelegramWebhookRequest(request: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return false;
  const provided = request.headers.get("x-telegram-bot-api-secret-token");
  if (!provided) return false;
  return timingSafeEqual(provided, expected);
}

/**
 * Constant-time string compare. The header value is short and the secret is
 * known a priori, so a JS-level loop is enough to dodge length-based timing
 * leaks; we don't need `crypto.timingSafeEqual` here.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function chunkText(value: string, max: number): string[] {
  if (value.length <= max) return [value];
  const out: string[] = [];
  for (let i = 0; i < value.length; i += max) {
    out.push(value.slice(i, i + max));
  }
  return out;
}
