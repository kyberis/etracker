import { cookies } from "next/headers";
import { z } from "zod";

import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { LOCALE_COOKIE, LOCALES } from "@/lib/i18n/locale";
import { persistTrefolioEcosystemUiLocaleCookie } from "@/lib/i18n/trefolio-ecosystem-locale-cookie";
import { requireUserId } from "@/lib/session";

const localeSchema = z.object({
  locale: z.enum(LOCALES),
});

/**
 * Updates the user's preferred locale and mirrors the value into the
 * `NEXT_LOCALE` cookie. The cookie keeps unauthenticated routes (marketing
 * pages, login) in sync without an extra DB roundtrip; the database stays
 * authoritative for the authenticated app and is also written here from
 * the AI-driven `setUserLocale` tool.
 */
export async function PATCH(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const body = await request.json();
    const parsed = localeSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid locale.", 400);
    }
    const { locale } = parsed.data;

    await db.user.update({
      where: { id: userId },
      data: { locale },
    });

    const cookieStore = await cookies();
    cookieStore.set(LOCALE_COOKIE, locale, {
      path: "/",
      sameSite: "lax",
      // 1 year — recreated on every successful PATCH.
      maxAge: 60 * 60 * 24 * 365,
    });

    await persistTrefolioEcosystemUiLocaleCookie(locale);

    return { ok: true, locale };
  });
}
