import type { Locale } from "@/lib/i18n/locale";

/**
 * Telegram + agent helper copy that stays **outside** the
 * `no-spanish-in-api-errors` scan glob so we can keep rioplatense Spanish for
 * `locale === "es"` without tripping the EN leak guard on `route.ts` files.
 */

export function quotaLimitMessage(locale: Locale, limit: number): string {
  return locale === "en"
    ? `You've reached the daily limit of ${limit} assistant messages. It resets at 00:00 UTC.`
    : `Llegaste al límite diario de ${limit} mensajes con el asistente. Se reinicia a las 00:00 UTC.`;
}

export function lowQuotaHint(locale: Locale, remaining: number): string {
  if (locale === "en") {
    return `_(You have ${remaining} assistant ${remaining === 1 ? "message" : "messages"} left today.)_`;
  }
  return `_(Te quedan ${remaining} ${remaining === 1 ? "mensaje" : "mensajes"} con el asistente hoy.)_`;
}

export function pdfExtractedMarkdownHeading(
  locale: Locale,
  filename: string,
  body: string,
): string {
  const heading = locale === "en" ? "Extracted text" : "Texto extraído";
  return `### ${heading}: ${filename}\n\n${body}`;
}

export function pdfScanOnlyMarkdownNote(
  locale: Locale,
  filename: string,
  pageCount: number,
): string {
  return locale === "en"
    ? `(_PDF ${filename}: no selectable text; first ${pageCount} page(s) sent as attached images._)`
    : `(_PDF ${filename}: sin texto seleccionable; las primeras ${pageCount} página(s) van como imagen adjunta._)`;
}
