import { redirect } from "next/navigation";

import { Logo } from "@/components/logo";
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  getDeletionScheduledFor,
  getGraceDaysRemaining,
} from "@/lib/account-deletion";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { intlLocale } from "@/lib/i18n/format";
import { getDict } from "@/lib/i18n/index";
import { getLocale } from "@/lib/i18n/server";

import {
  AccountRestoreClient,
  type AccountRestoreCopy,
} from "./account-restore-client";

/**
 * Recovery surface for accounts in the 30-day soft-delete window.
 *
 * Reached automatically: the (app) layout redirects every signed-in user
 * with `User.deletedAt` set here, so we never have to render the dashboard
 * for a pending-deletion account. The page itself sits **outside** the
 * `(app)` group on purpose — it must skip the onboarding / accept-terms
 * gates so a soft-deleted user with stale consent can still recover their
 * data without first being forced through unrelated wizards.
 *
 * Three exit paths:
 *  1. `Restaurar` → `POST /api/account/restore` → bounce to `/app`.
 *  2. `Cerrar sesión` → NextAuth signOut → user lands on the marketing
 *     root and the account stays in the soft-delete queue (cron purges
 *     eventually).
 *  3. Doing nothing → the daily `/api/cron/account-purge` cron hard-
 *     deletes the row at `deletedAt + ACCOUNT_DELETION_GRACE_DAYS`.
 */
export default async function AccountRestorePage() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const [user, locale] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, deletedAt: true },
    }),
    getLocale(),
  ]);

  if (!user) {
    // The session JWT outlived the user row (purge cron ran while the JWT
    // was still valid). Bounce to login; the cookie is harmless without a
    // backing row but the UX is cleaner.
    redirect("/login");
  }

  if (!user.deletedAt) {
    // Account is fine — a stale tab landed here. Send them to the app.
    redirect("/app");
  }

  const t = getDict(locale).accountRestore;
  const scheduledFor = getDeletionScheduledFor(user.deletedAt);
  const daysRemaining = getGraceDaysRemaining(user.deletedAt);
  const formatter = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "long",
    timeStyle: "short",
  });
  const deletedAtLabel = formatter.format(user.deletedAt);
  const scheduledForLabel = formatter.format(scheduledFor);

  const copy: AccountRestoreCopy = {
    title: t.title,
    intro: t.intro(user.email),
    scheduledLine: t.scheduledLine(scheduledForLabel, deletedAtLabel),
    daysRemainingLine:
      daysRemaining > 0
        ? t.daysRemaining(daysRemaining, ACCOUNT_DELETION_GRACE_DAYS)
        : null,
    graceElapsedLine: daysRemaining > 0 ? null : t.graceElapsed,
    whatNowTitle: t.whatNowTitle,
    bulletRestore: t.bulletRestore,
    bulletWait: t.bulletWait(ACCOUNT_DELETION_GRACE_DAYS),
    bulletSignOut: t.bulletSignOut,
    restore: t.restore,
    restoring: t.restoring,
    signOut: t.signOut,
    signingOut: t.signingOut,
    restoreError: t.restoreError,
    signOutCallbackUrl: locale === "en" ? "/en" : "/es",
  };

  return (
    <main className="relative flex min-h-screen flex-col bg-background px-4 py-8">
      <header className="mx-auto w-full max-w-2xl">
        <Logo size="md" />
      </header>
      <div className="mx-auto flex w-full max-w-2xl flex-1 items-start justify-center pt-6 pb-12 sm:pt-12">
        <AccountRestoreClient copy={copy} />
      </div>
    </main>
  );
}
