/**
 * Locale primitives. Two locales are supported:
 *
 * - `es` (default): Spanish, rioplatense register on the AI agent.
 * - `en`: Neutral conversational English.
 *
 * The locale resolves from (in order):
 *  1. The authenticated user's `User.locale` in the database.
 *  2. The `NEXT_LOCALE` cookie (set by the menu switcher / proxy).
 *  3. The `Accept-Language` request header.
 *  4. Fallback: `es`.
 */

export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "es";

export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function normalizeLocale(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE;
  const lower = value.toLowerCase();
  if (lower.startsWith("en")) return "en";
  if (lower.startsWith("es")) return "es";
  return DEFAULT_LOCALE;
}

/** BCP-47 string for `Intl` APIs and `<html lang>`. */
export function toBcp47(locale: Locale): string {
  return locale === "es" ? "es-AR" : "en-US";
}

/** Native label for the language picker. */
export const LOCALE_LABELS: Record<Locale, string> = {
  es: "Español",
  en: "English",
};

/** Best `Accept-Language` parser for our two-locale world. */
export function pickFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const languages = header
    .split(",")
    .map((part) => {
      const [tag, qPart] = part.trim().split(";");
      const q = qPart?.trim().startsWith("q=")
        ? Number(qPart.slice(2)) || 0
        : 1;
      return { tag: tag.toLowerCase(), q };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of languages) {
    if (tag.startsWith("en")) return "en";
    if (tag.startsWith("es")) return "es";
  }
  return DEFAULT_LOCALE;
}
