import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@/lib/account-deletion";
import { intlLocale } from "@/lib/i18n/format";
import { getDict } from "@/lib/i18n/index";
import { isLocale, type Locale } from "@/lib/i18n/locale";
import { buildMetadata } from "@/lib/seo";

type PageProps = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{
    until?: string | string[];
    force?: string | string[];
  }>;
};

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const copy = getDict(lang).accountDeleted;
  const sp = await searchParams;
  const isForce = readFlag(sp.force);
  return buildMetadata({
    title: isForce ? copy.forceMetaTitle : copy.metaTitle,
    description: isForce ? copy.forceMetaDescription : copy.metaDescription,
    path: `/${lang}/account-deleted`,
    locale: lang,
    pathByLocale: {
      es: "/es/account-deleted",
      en: "/en/account-deleted",
    },
    // Don't index the soft-delete confirmation page: it's a one-shot
    // landing for users right after they pressed "Borrar mi cuenta",
    // not content we want surfaced in search.
    index: false,
  });
}

export function generateStaticParams() {
  return [{ lang: "es" }, { lang: "en" }];
}

/**
 * Public confirmation rendered right after a user signs out via the
 * settings "Borrar mi cuenta" flow. The DELETE response wipes the
 * NextAuth cookie, the client redirects here, and we read the scheduled-
 * for instant from the `?until=ISO` query param so the page doesn't need
 * a second DB round-trip (the user is already signed out by the time
 * they land).
 *
 * If `until` is missing or unparseable we still render: the page falls
 * back to the generic 30-day copy. The exact date is nice-to-have
 * polish, not a correctness requirement.
 */
export default async function AccountDeletedPage({
  params,
  searchParams,
}: PageProps) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;

  const sp = await searchParams;
  const isForce = readFlag(sp.force);
  const rawUntil = Array.isArray(sp.until) ? sp.until[0] : sp.until;
  const scheduledFor = isForce ? null : parseScheduledFor(rawUntil);

  const t = getDict(locale).accountDeleted;
  const formatter = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "long",
  });
  const scheduledForLabel = scheduledFor
    ? formatter.format(scheduledFor)
    : null;

  if (isForce) {
    return (
      <article className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
        <header className="mb-8 space-y-3">
          <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">
            {t.forceTitle}
          </h1>
          <p className="text-muted-foreground leading-relaxed">{t.forceIntro}</p>
        </header>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button render={<Link href={`/${locale}`} />}>{t.backHome}</Button>
        </div>
      </article>
    );
  }

  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <header className="mb-8 space-y-3">
        <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">
          {t.title}
        </h1>
        <p className="text-muted-foreground leading-relaxed">
          {t.intro(ACCOUNT_DELETION_GRACE_DAYS)}
        </p>
        {scheduledForLabel ? (
          <p className="text-sm font-medium">
            {t.scheduledLine(scheduledForLabel)}
          </p>
        ) : null}
      </header>
      <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
        {t.recoveryHint}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button render={<Link href="/login" />}>{t.signIn}</Button>
        <Button variant="ghost" render={<Link href={`/${locale}`} />}>
          {t.backHome}
        </Button>
      </div>
    </article>
  );
}

function readFlag(value: string | string[] | undefined): boolean {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "1" || v === "true";
}

/**
 * Tolerant ISO parser. We only render the date when the input is an
 * actual `Date` (not Invalid Date) and looks like something the soft-
 * delete endpoint produced — anything else falls through to the generic
 * "your account is in the queue" copy.
 */
function parseScheduledFor(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  // Sanity bound: ignore dates more than a year out, or in the past more
  // than a day. Stops a hand-crafted query string from displaying nonsense
  // (e.g. `?until=1900-01-01`).
  const oneDayMs = 24 * 60 * 60 * 1000;
  const oneYearMs = 365 * oneDayMs;
  const now = Date.now();
  if (parsed.getTime() < now - oneDayMs) return null;
  if (parsed.getTime() > now + oneYearMs) return null;
  // The link from settings carries `getDeletionScheduledFor(deletedAt)`
  // already; we don't recompute it here. The fallback below is only hit
  // when the user hand-crafts the URL.
  return parsed;
}
