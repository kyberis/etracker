import { redirect } from "next/navigation";

import { getLocaleFromRequest } from "@/lib/i18n/server";

/**
 * Root of the marketing route group. The localised landing pages live
 * under `(marketing)/[lang]/...`; here we just resolve the active locale
 * and redirect so `/` always lands on `/es` or `/en`.
 *
 * Note: we don't `permanent` because the locale can shift between
 * sessions (cookie/header changes); a 307 keeps that flexibility.
 */
export default async function MarketingRedirect() {
  const locale = await getLocaleFromRequest();
  redirect(`/${locale}`);
}
