import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { touchActivity } from "@/lib/activity";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLocale } from "@/lib/i18n/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Mark the user as active for today (DAU). Cheap on warm rows and the
  // promise resolves before the layout commits, keeping the row in sync
  // even for users who only browse the dashboard without hitting any API.
  void touchActivity(session.user.id);

  // Onboarding gate: usuarios que nunca completaron el wizard (incluye Google
  // sign-ups que aterrizan acá directo y usuarios viejos sin nada cargado)
  // van al wizard. Una vez completado o salteado, `onboardingCompletedAt`
  // queda sellado y este redirect deja de dispararse.
  const [user, locale] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: { onboardingCompletedAt: true },
    }),
    getLocale(),
  ]);
  if (user && user.onboardingCompletedAt === null) {
    redirect("/onboarding");
  }

  return (
    <AppShell isAdmin={session.user.isAdmin} locale={locale}>
      {children}
    </AppShell>
  );
}
