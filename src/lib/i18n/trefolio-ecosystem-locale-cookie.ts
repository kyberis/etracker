import type { NextRequest, NextResponse } from "next/server";
import { cookies, headers } from "next/headers";

import {
  LOCALE_COOKIE,
  normalizeLocale,
  pickFromAcceptLanguage,
  type Locale,
} from "@/lib/i18n/locale";

export const TREFOLIO_UI_LOCALE_COOKIE = "trefolio_ui_locale";

const IDP_SUPPORTED = new Set(["en", "de", "es", "fr", "it"]);

/**
 * Map any app language tag to a single OIDC `ui_locales` value the IdP supports
 * (aligns with trefolio `mapAppLanguageToIdpUiLocalesTag`).
 */
export function mapAppLanguageToIdpUiLocalesTag(lang: string | undefined | null): string {
  if (!lang?.trim()) return "en";
  const primary = lang.trim().toLowerCase().split(/[-_]/)[0];
  if (IDP_SUPPORTED.has(primary)) return primary;
  return "en";
}

export function ecosystemCookieDomainFromHost(host: string | null | undefined): string | undefined {
  if (!host) return undefined;
  const h = host.split(",")[0]?.trim().split(":")[0]?.toLowerCase() ?? "";
  if (!h || h === "localhost" || h.startsWith("127.")) return undefined;
  const parts = h.split(".");
  if (parts.length < 2) return undefined;
  return `.${parts.slice(-2).join(".")}`;
}

export function claraLocaleToIdpUiTag(locale: Locale): string {
  return locale === "es" ? "es" : "en";
}

const TTL = 60 * 60 * 24 * 365;

export function appendTrefolioEcosystemUiLocaleCookie(
  request: NextRequest,
  response: NextResponse,
  locale: Locale,
): void {
  const value = claraLocaleToIdpUiTag(locale);
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    "";
  const domain = ecosystemCookieDomainFromHost(host);
  response.cookies.set(TREFOLIO_UI_LOCALE_COOKIE, value, {
    path: "/",
    maxAge: TTL,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
    ...(domain ? { domain } : {}),
  });
}

export async function persistTrefolioEcosystemUiLocaleCookie(locale: Locale): Promise<void> {
  const jar = await cookies();
  const hdrs = await headers();
  const host =
    hdrs.get("x-forwarded-host")?.split(",")[0]?.trim() || hdrs.get("host") || "";
  const domain = ecosystemCookieDomainFromHost(host);
  const value = claraLocaleToIdpUiTag(locale);
  jar.set(TREFOLIO_UI_LOCALE_COOKIE, value, {
    path: "/",
    maxAge: TTL,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
    ...(domain ? { domain } : {}),
  });
}

/**
 * Server-only: OIDC `ui_locales` for user.trefolio.com.
 * Order: ecosystem bridge cookie (`trefolio_ui_locale`, shared with trefolio)
 * → Clara `NEXT_LOCALE` → Accept-Language via `pickFromAcceptLanguage`.
 */
export async function resolveClaraUiLocalesForIdpAuthorize(): Promise<string> {
  const jar = await cookies();
  const hdrs = await headers();
  const ecosystem = jar.get(TREFOLIO_UI_LOCALE_COOKIE)?.value?.trim();
  if (ecosystem) {
    return mapAppLanguageToIdpUiLocalesTag(ecosystem);
  }
  const fromCookie = jar.get(LOCALE_COOKIE)?.value;
  const locale = fromCookie
    ? normalizeLocale(fromCookie)
    : pickFromAcceptLanguage(hdrs.get("accept-language"));
  return claraLocaleToIdpUiTag(locale);
}
