import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { touchActivity } from "@/lib/activity";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLocale } from "@/lib/i18n/server";
import { hasCurrentConsent } from "@/lib/legal";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Mark the user as active for today (DAU). Cheap on warm rows and the
  // promise resolves before the layout commits, keeping the row in sync
  // even for users who only browse the dashboard without hitting any API.
  void touchActivity(session.user.id);

  const [user, locale] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: {
        onboardingCompletedAt: true,
        acceptedTermsAt: true,
        acceptedTermsVersion: true,
        deletedAt: true,
      },
    }),
    getLocale(),
  ]);

  // Soft-delete gate runs before every other guard so a user who clicks
  // "Borrar mi cuenta" but later changes their mind can recover the
  // account without bouncing through onboarding/accept-terms first.
  if (user?.deletedAt) {
    redirect("/account/restore");
  }

  // GDPR Art. 7(1) — block the app until the user has accepted the live
  // Terms version. Covers Google sign-ins (no consent stamped at signup),
  // legacy accounts, and forced re-acceptance after a Terms bump. Runs
  // before the onboarding redirect so the consent gate fires once, not
  // twice.
  if (user && !hasCurrentConsent(user.acceptedTermsAt, user.acceptedTermsVersion)) {
    redirect("/accept-terms?next=/app");
  }

  // Onboarding gate: usuarios que nunca completaron el wizard (incluye Google
  // sign-ups que aterrizan acá directo y usuarios viejos sin nada cargado)
  // van al wizard. Una vez completado o salteado, `onboardingCompletedAt`
  // queda sellado y este redirect deja de dispararse.
  if (user && user.onboardingCompletedAt === null) {
    redirect("/onboarding");
  }

  return (
    <AppShell isAdmin={session.user.isAdmin} locale={locale}>
      {children}
    </AppShell>
  );
}
