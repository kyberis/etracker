/**
 * Money formatting helpers.
 *
 * The primary currency lives on `User.primaryCurrency` and is threaded down
 * from server components into UI props. A few legacy spots still rely on the
 * USD default — that's safe (purely cosmetic) and we override them at the
 * call site as we go.
 */

const DEFAULT_LOCALE = "en-US";

export function formatCurrency(value: number, currency: string = "USD"): string {
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Shorter amounts for tight UI (e.g. timeline). */
export function formatCurrencyCompact(value: number, currency: string = "USD"): string {
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
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
): string {
  const original = formatCurrency(Number(line.amount), line.currency);
  if (line.currency.toUpperCase() === primaryCurrency.toUpperCase()) {
    return original;
  }
  const converted = formatCurrency(Number(line.amountConverted), primaryCurrency);
  return `${original} (~ ${converted})`;
}
