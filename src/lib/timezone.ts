/**
 * Country (ISO-3166 alpha-2) → IANA timezone inference.
 *
 * Clara's `User` table stores `country` (captured in onboarding) and `locale`,
 * but NO explicit timezone. That is enough for copy choices, but not for
 * scheduled outbound messages that must fire around a sensible local hour
 * (e.g. the 20:00 daily Telegram nudge). This module is the single place that
 * decides "for a user in AR, what does 'today at 20:00' mean in UTC?".
 *
 * The map below covers the countries Clara supports today (rioplatense +
 * Spanish-speaking EU/LATAM + English-speaking defaults). For any unknown
 * code we fall back to `UTC`, which keeps the cron deterministic rather than
 * failing a nudge. Countries with multiple zones (US, BR, AU, RU, CA, AR
 * historically) get the most populated zone — good enough for a nudge whose
 * tolerance is "±1 hour".
 */

import { isLocale, type Locale } from "@/lib/i18n/locale";

/** Default zone when no country / unknown country. Intentionally UTC to
 * surface the miss in logs rather than silently pretending we know better. */
export const DEFAULT_TIMEZONE = "UTC" as const;

/**
 * ISO-3166 alpha-2 → IANA zone. Keep this list small and explicit; add
 * entries as users from new countries sign up.
 */
const COUNTRY_TO_TIMEZONE: Record<string, string> = {
  // Rioplatense / LATAM
  AR: "America/Argentina/Buenos_Aires",
  UY: "America/Montevideo",
  PY: "America/Asuncion",
  CL: "America/Santiago",
  BO: "America/La_Paz",
  PE: "America/Lima",
  EC: "America/Guayaquil",
  CO: "America/Bogota",
  VE: "America/Caracas",
  BR: "America/Sao_Paulo",
  MX: "America/Mexico_City",
  CR: "America/Costa_Rica",
  GT: "America/Guatemala",
  PA: "America/Panama",
  DO: "America/Santo_Domingo",
  PR: "America/Puerto_Rico",
  CU: "America/Havana",
  // Europe
  ES: "Europe/Madrid",
  PT: "Europe/Lisbon",
  FR: "Europe/Paris",
  IT: "Europe/Rome",
  DE: "Europe/Berlin",
  AT: "Europe/Vienna",
  CH: "Europe/Zurich",
  BE: "Europe/Brussels",
  NL: "Europe/Amsterdam",
  LU: "Europe/Luxembourg",
  IE: "Europe/Dublin",
  GB: "Europe/London",
  UK: "Europe/London",
  PL: "Europe/Warsaw",
  CZ: "Europe/Prague",
  SK: "Europe/Bratislava",
  HU: "Europe/Budapest",
  RO: "Europe/Bucharest",
  BG: "Europe/Sofia",
  GR: "Europe/Athens",
  FI: "Europe/Helsinki",
  SE: "Europe/Stockholm",
  NO: "Europe/Oslo",
  DK: "Europe/Copenhagen",
  IS: "Atlantic/Reykjavik",
  // English-speaking defaults (most populated zone)
  US: "America/New_York",
  CA: "America/Toronto",
  AU: "Australia/Sydney",
  NZ: "Pacific/Auckland",
};

/**
 * Resolve a country code to a timezone. Case-insensitive; null / unknown
 * returns `DEFAULT_TIMEZONE`.
 */
export function countryToTimezone(country: string | null | undefined): string {
  if (!country) return DEFAULT_TIMEZONE;
  const normalized = country.trim().toUpperCase();
  if (normalized.length !== 2) return DEFAULT_TIMEZONE;
  return COUNTRY_TO_TIMEZONE[normalized] ?? DEFAULT_TIMEZONE;
}

/**
 * Return a stable locale string to pass to `Intl` APIs. The nudge uses this
 * indirectly — `Intl.DateTimeFormat` accepts any BCP-47 tag and only needs
 * the calendar / digits. We pick `en-CA` because it produces ISO-like
 * `yyyy-MM-dd` via `formatToParts`.
 */
const ISO_LOCALE = "en-CA";

type DateParts = {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
};

/**
 * Decompose a UTC Date into its calendar parts AS SEEN from `timezone`.
 * Uses `Intl.DateTimeFormat.formatToParts` — no extra deps, correct DST
 * behaviour across Europe (CET/CEST), Chile (CLT/CLST), etc.
 */
function partsInZone(dateUtc: Date, timezone: string): DateParts {
  const fmt = new Intl.DateTimeFormat(ISO_LOCALE, {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(dateUtc);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  for (const p of parts) {
    if (p.type === "year") year = Number(p.value);
    else if (p.type === "month") month = Number(p.value);
    else if (p.type === "day") day = Number(p.value);
    else if (p.type === "hour") hour = Number(p.value);
  }
  // `Intl` renders midnight as "24" in some locales/zones; normalize.
  if (hour === 24) hour = 0;
  return { year, month, day, hour };
}

/**
 * Current hour (0-23) in `timezone` for the given reference instant
 * (defaults to now). Used by the cron to decide whether it's time to fire
 * the nudge for this user.
 */
export function currentHourInTimezone(
  timezone: string,
  nowUtc: Date = new Date(),
): number {
  return partsInZone(nowUtc, timezone).hour;
}

/**
 * UTC bounds of "today" in `timezone`, for the day that contains `nowUtc`.
 * `startUtc` is the UTC instant of the LOCAL midnight that started the day,
 * `endUtc` is the next LOCAL midnight (exclusive upper bound for queries).
 *
 * This is the "local day window" used to decide whether a user already
 * logged something "today" and whether a nudge was already sent "today".
 */
export function localDayBoundsInUtc(
  timezone: string,
  nowUtc: Date = new Date(),
): { startUtc: Date; endUtc: Date } {
  const parts = partsInZone(nowUtc, timezone);
  const startUtc = zonedLocalToUtc(timezone, {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: 0,
  });
  // 27h to comfortably cross any spring-forward / fall-back quirk, then
  // recompute the date and round DOWN to local midnight.
  const tomorrow = partsInZone(
    new Date(startUtc.getTime() + 27 * 60 * 60 * 1000),
    timezone,
  );
  const endUtc = zonedLocalToUtc(timezone, {
    year: tomorrow.year,
    month: tomorrow.month,
    day: tomorrow.day,
    hour: 0,
  });
  return { startUtc, endUtc };
}

/**
 * Convert "local wall-clock time in `timezone`" → UTC `Date`. Works by
 * doing two `Intl` probes and adjusting: given a wall-clock target
 * (YYYY-MM-DD HH:00 in `timezone`), find the UTC instant whose projection
 * in `timezone` equals that wall-clock. Handles DST because the second
 * probe corrects the first-guess offset.
 */
function zonedLocalToUtc(
  timezone: string,
  local: { year: number; month: number; day: number; hour: number },
): Date {
  const asUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    0,
    0,
  );
  const probe = new Date(asUtc);
  const probed = partsInZone(probe, timezone);
  const probedUtc = Date.UTC(
    probed.year,
    probed.month - 1,
    probed.day,
    probed.hour,
    0,
    0,
  );
  const offsetMs = probedUtc - asUtc;
  return new Date(asUtc - offsetMs);
}

/**
 * Guard that a locale-like string is one we handle in the nudge copy. Any
 * unknown string falls back to `es` (Clara's default), mirroring how the
 * agent loop resolves locales.
 */
export function resolveLocaleForOutbound(
  value: string | null | undefined,
): Locale {
  return isLocale(value) ? value : "es";
}
