/**
 * Money formatting helpers.
 *
 * The primary currency lives on `User.primaryCurrency` and is threaded down
 * from server components into UI props. Locale-sensitive: we resolve a
 * BCP-47 string from the active i18n locale ("es-AR" / "en-US") so that
 * grouping and decimal separators match the rest of the UI.
 */

import { intlLocale } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";

export function formatCurrency(
  value: number,
  currency: string = "USD",
  locale: Locale = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Shorter amounts for tight UI (e.g. timeline). */
export function formatCurrencyCompact(
  value: number,
  currency: string = "USD",
  locale: Locale = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

/**
 * Format a `MonthExpenseLine`-shaped amount. When the line was charged in a
 * different currency than the user's primary, surface both: the original
 * amount (what the user paid) and the converted equivalent (what we use for
 * math), e.g. `EUR 45.50 (~ USD 50.00)`.
 */
export function formatLineAmount(
  line: { amount: string | number; currency: string; amountConverted: string | number },
  primaryCurrency: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const original = formatCurrency(Number(line.amount), line.currency, locale);
  if (line.currency.toUpperCase() === primaryCurrency.toUpperCase()) {
    return original;
  }
  const converted = formatCurrency(
    Number(line.amountConverted),
    primaryCurrency,
    locale,
  );
  return `${original} (~ ${converted})`;
}
