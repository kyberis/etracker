/**
 * Clara agent replies use CommonMark-style **bold** in prompts.
 * Each outbound channel needs different escaping / markup.
 */

/** Escape text for Telegram HTML parse mode (messages and captions). */
export function escapeHtmlForTelegram(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Telegram Bot API HTML mode: convert **segments** to <b>…</b>.
 * Other text is HTML-escaped. Suitable for sendMessage / sendPhoto caption.
 */
export function formatAgentMarkdownForTelegramHtml(text: string): string {
  if (!text) return "";
  const segments = text.split(/(\*\*[\s\S]*?\*\*)/g);
  return segments
    .map((part) => {
      const inner = /^\*\*([\s\S]*?)\*\*$/.exec(part);
      if (inner) return `<b>${escapeHtmlForTelegram(inner[1])}</b>`;
      return escapeHtmlForTelegram(part);
    })
    .join("");
}
