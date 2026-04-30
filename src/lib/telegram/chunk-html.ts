/**
 * Split Clara's outbound Telegram HTML into `sendMessage`-sized chunks without
 * breaking `<b>…</b>` pairs. Telegram rejects invalid HTML ("can't parse
 * entities") and the webhook would otherwise fail the whole outbound send.
 */

export const TELEGRAM_MESSAGE_MAX = 4096;

const BOLD_OPEN = "<b>";
const BOLD_CLOSE = "</b>";

/** Remove bold tags for plain-text fallback when HTML parse fails. */
export function stripTelegramBoldTags(html: string): string {
  return html.replace(/<\/?b>/gi, "");
}

/**
 * Split a plain fragment (no `<b>` / `</b>` — only entities) so each part
 * is ≤ maxLen, preferring paragraph and line breaks.
 */
export function chunkPlainTelegramHtml(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + maxLen, text.length);
    if (end < text.length) {
      let cut = text.lastIndexOf("\n\n", end);
      if (cut <= i) cut = text.lastIndexOf("\n", end);
      if (cut <= i) cut = end;
      end = cut;
    }
    out.push(text.slice(i, end));
    i = end;
  }
  return out;
}

function splitLongBoldSegment(tagged: string, maxLen: number): string[] {
  if (tagged.length <= maxLen) return [tagged];
  if (!tagged.startsWith(BOLD_OPEN) || !tagged.endsWith(BOLD_CLOSE)) {
    return chunkPlainTelegramHtml(tagged, maxLen);
  }
  const inner = tagged.slice(BOLD_OPEN.length, -BOLD_CLOSE.length);
  const innerMax = Math.max(1, maxLen - BOLD_OPEN.length - BOLD_CLOSE.length);
  return chunkPlainTelegramHtml(inner, innerMax).map(
    (chunk) => `${BOLD_OPEN}${chunk}${BOLD_CLOSE}`,
  );
}

/**
 * Parse HTML produced by `formatAgentMarkdownForTelegramHtml`: only `<b>`
 * tags, everything else entity-escaped.
 */
export function parseTelegramHtmlSegments(html: string): string[] {
  const segments: string[] = [];
  let rest = html;
  const re = /^([\s\S]*?)<b>([\s\S]*?)<\/b>/;
  while (rest.length > 0) {
    const m = rest.match(re);
    if (!m) {
      segments.push(rest);
      break;
    }
    if (m[1]) segments.push(m[1]);
    segments.push(`${BOLD_OPEN}${m[2]}${BOLD_CLOSE}`);
    rest = rest.slice(m[0].length);
  }
  return segments;
}

/**
 * Build chunks each ≤ {@link TELEGRAM_MESSAGE_MAX} without splitting inside
 * `<b>…</b>`.
 */
export function chunkTelegramHtmlForSend(html: string): string[] {
  if (!html) return [""];
  if (html.length <= TELEGRAM_MESSAGE_MAX) return [html];

  const raw = parseTelegramHtmlSegments(html);
  const pieces: string[] = [];
  for (const seg of raw) {
    if (seg.startsWith(BOLD_OPEN)) {
      pieces.push(...splitLongBoldSegment(seg, TELEGRAM_MESSAGE_MAX));
    } else {
      pieces.push(...chunkPlainTelegramHtml(seg, TELEGRAM_MESSAGE_MAX));
    }
  }

  const chunks: string[] = [];
  let cur = "";
  for (const p of pieces) {
    if (p.length > TELEGRAM_MESSAGE_MAX) {
      if (cur) {
        chunks.push(cur);
        cur = "";
      }
      for (let i = 0; i < p.length; i += TELEGRAM_MESSAGE_MAX) {
        chunks.push(p.slice(i, i + TELEGRAM_MESSAGE_MAX));
      }
      continue;
    }
    if (cur.length === 0) {
      cur = p;
    } else if (cur.length + p.length <= TELEGRAM_MESSAGE_MAX) {
      cur += p;
    } else {
      chunks.push(cur);
      cur = p;
    }
  }
  if (cur) chunks.push(cur);
  return chunks.length ? chunks : [""];
}
