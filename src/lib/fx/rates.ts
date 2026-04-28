import { Prisma } from "@prisma/client";
import { getCache } from "@vercel/functions";

import { log } from "@/lib/log";

/**
 * Foreign exchange (FX) rate service.
 *
 * - Free, key-less source: `https://api.exchangerate.host/convert?from=…&to=…`.
 * - Rates are cached in Vercel Runtime Cache for one hour, tagged so an admin
 *   could invalidate them out-of-band if the upstream goes wrong.
 * - On upstream failure we throw `FxUnavailableError` so callers (REST/AI
 *   tool) can fall back to asking the user for a manual rate.
 *
 * The rate is **locked** at the moment a `MonthExpenseLine` is created, so
 * past totals never shift if rates fluctuate later.
 */

const CACHE_NAMESPACE = "etracker:fx";
const CACHE_TTL_SECONDS = 60 * 60; // 1 hour
const FX_API_BASE = "https://api.exchangerate.host";

export class FxUnavailableError extends Error {
  constructor(public readonly from: string, public readonly to: string, cause?: unknown) {
    super(`FX rate unavailable for ${from}->${to}`);
    this.name = "FxUnavailableError";
    if (cause instanceof Error) this.cause = cause;
  }
}

export function fxTag(from: string, to: string): string {
  return `fx:${from.toUpperCase()}:${to.toUpperCase()}`;
}

function fakeRateFromEnv(from: string, to: string): number | null {
  const key = `FX_FAKE_RATE_${from.toUpperCase()}_${to.toUpperCase()}`;
  const raw = process.env[key];
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

type ExchangeRateResponse = {
  success?: boolean;
  result?: number;
  info?: { rate?: number };
};

async function fetchRateFromUpstream(from: string, to: string): Promise<number> {
  const url = `${FX_API_BASE}/convert?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=1`;
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  } catch (cause) {
    throw new FxUnavailableError(from, to, cause);
  }
  if (!response.ok) {
    throw new FxUnavailableError(from, to, new Error(`HTTP ${response.status}`));
  }
  const data = (await response.json()) as ExchangeRateResponse;
  const raw = data.result ?? data.info?.rate;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    throw new FxUnavailableError(from, to, new Error("Invalid rate payload"));
  }
  return raw;
}

/**
 * Fetch the live FX rate `1 from = X to`. Hits Runtime Cache first; falls
 * back to the upstream on miss. Throws `FxUnavailableError` if nothing works.
 */
export async function fetchFxRate(from: string, to: string): Promise<Prisma.Decimal> {
  const upper = (s: string) => s.toUpperCase();
  const fromU = upper(from);
  const toU = upper(to);
  if (fromU === toU) return new Prisma.Decimal(1);

  const fake = fakeRateFromEnv(fromU, toU);
  if (fake !== null) return new Prisma.Decimal(fake.toString());

  let cache: ReturnType<typeof getCache> | null = null;
  try {
    cache = getCache({ namespace: CACHE_NAMESPACE });
  } catch {
    cache = null;
  }

  const cacheKey = `${fromU}:${toU}`;
  if (cache) {
    try {
      const cached = (await cache.get(cacheKey)) as string | null;
      if (cached) return new Prisma.Decimal(cached);
    } catch {
      /* best-effort cache hit */
    }
  }

  let rate: number;
  try {
    rate = await fetchRateFromUpstream(fromU, toU);
  } catch (error) {
    log.warn("fx.fetch_failed", { from: fromU, to: toU, error: String(error) });
    throw error;
  }

  if (cache) {
    try {
      await cache.set(cacheKey, rate.toString(), {
        ttl: CACHE_TTL_SECONDS,
        tags: [fxTag(fromU, toU)],
      });
    } catch {
      /* best-effort cache write */
    }
  }

  return new Prisma.Decimal(rate.toString());
}

export type ConvertResult = {
  /** ISO 4217 code, normalized to upper case. */
  currency: string;
  /** Original amount (untouched), as a 2-decimal Prisma Decimal. */
  amount: Prisma.Decimal;
  /** Multiplier locked at conversion time. `1` when currency === primary. */
  fxRate: Prisma.Decimal;
  /** Pre-computed amount in the user's primary currency, 2 decimals. */
  amountConverted: Prisma.Decimal;
};

/**
 * Resolve a line amount into the four columns we persist on
 * `MonthExpenseLine`: `currency`, `amount`, `fxRate`, `amountConverted`.
 *
 * - When `currency === primary`, no upstream call: rate is 1 and converted
 *   matches `amount`.
 * - When `fxRate` is provided we trust it (manual override path used by the
 *   AI / Argentine "blue dolar" cases) and skip the API entirely.
 * - Otherwise we fetch + multiply with `Prisma.Decimal` to avoid float drift.
 */
export async function convertToPrimary(input: {
  amount: number | string | Prisma.Decimal;
  currency: string;
  primary: string;
  fxRate?: number | string | Prisma.Decimal;
}): Promise<ConvertResult> {
  const currency = input.currency.toUpperCase();
  const primary = input.primary.toUpperCase();
  const amount = new Prisma.Decimal(input.amount as Prisma.Decimal.Value);

  let fxRate: Prisma.Decimal;
  if (input.fxRate !== undefined && input.fxRate !== null) {
    fxRate = new Prisma.Decimal(input.fxRate as Prisma.Decimal.Value);
  } else if (currency === primary) {
    fxRate = new Prisma.Decimal(1);
  } else {
    fxRate = await fetchFxRate(currency, primary);
  }

  // Round converted amount to 2 decimals (DB column is Decimal(12,2)).
  const amountConverted = amount.mul(fxRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  return {
    currency,
    amount: amount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
    fxRate,
    amountConverted,
  };
}

/**
 * Normalise a user-supplied currency string to ISO 4217 (3 uppercase
 * letters). Returns null when the input is malformed; callers should treat
 * that as a 400.
 */
export function normalizeCurrencyCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(trimmed)) return null;
  return trimmed;
}
