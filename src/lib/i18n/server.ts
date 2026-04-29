import "server-only";

import { cookies, headers } from "next/headers";

import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";

import { getDict } from "./index";
import {
  LOCALE_COOKIE,
  isLocale,
  normalizeLocale,
  pickFromAcceptLanguage,
  type Locale,
} from "./locale";
import type { Dict } from "./dictionaries/es";

/**
 * Server-side resolver for the active locale. Order:
 *
 * 1. `User.locale` (authoritative for logged-in users; the chat-driven
 *    `setUserLocale` tool writes here directly).
 * 2. `NEXT_LOCALE` cookie (set by the menu switcher and by the proxy on
 *    first request).
 * 3. `Accept-Language` request header.
 * 4. Default locale (`es`).
 */
export async function getLocale(): Promise<Locale> {
  const session = await getAuthSession();
  if (session?.user?.id) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { locale: true },
    });
    if (user && isLocale(user.locale)) {
      return user.locale;
    }
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(LOCALE_COOKIE)?.value;
  if (cookieValue) {
    return normalizeLocale(cookieValue);
  }

  const headerStore = await headers();
  return pickFromAcceptLanguage(headerStore.get("accept-language"));
}

/**
 * Cheaper variant for public pages: skips the DB lookup. Use in marketing
 * route handlers / metadata generation when there is no authenticated user
 * (or when reading the user is not worth a round-trip).
 */
export async function getLocaleFromRequest(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(LOCALE_COOKIE)?.value;
  if (cookieValue) {
    return normalizeLocale(cookieValue);
  }
  const headerStore = await headers();
  return pickFromAcceptLanguage(headerStore.get("accept-language"));
}

/** Server-side translator. Pass `locale` to skip resolution. */
export async function getT(locale?: Locale): Promise<Dict> {
  if (locale) return getDict(locale);
  return getDict(await getLocale());
}
