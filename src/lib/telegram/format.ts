/**
 * Re-export Telegram HTML escaping helpers used by `telegram/client.ts`.
 */

export {
  escapeHtmlForTelegram,
  formatAgentMarkdownForTelegramHtml,
} from "@/lib/messaging/format-outbound";
