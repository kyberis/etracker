import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { hasCurrentConsent } from "@/lib/legal";
import { requireUserId } from "@/lib/session";

import { OnboardingWizard, type OnboardingInitial } from "./wizard";

/**
 * Server entry point del wizard. Carga el snapshot del usuario en una sola
 * query y se lo pasa al componente cliente. Si el usuario ya completó el
 * wizard antes (ej. lo terminó en otra pestaña), lo mandamos a `/app` para
 * que la flecha de "Continuar" del último paso no quede colgada.
 */
export default async function OnboardingPage() {
  const userId = await requireUserId();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      country: true,
      usageReasons: true,
      primaryCurrency: true,
      primaryCurrencyConfirmedAt: true,
      onboardingCompletedAt: true,
      acceptedTermsAt: true,
      acceptedTermsVersion: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  // Defense-in-depth: block the wizard until consent is on file. Google
  // first-time sign-ups land here without ever ticking a consent checkbox,
  // and the onboarding wizard collects personal data (name, country,
  // currency, recurring income templates) — so we cannot run it without
  // a lawful basis. Email/password signups already have consent from the
  // register form, so this is a no-op for them.
  if (!hasCurrentConsent(user.acceptedTermsAt, user.acceptedTermsVersion)) {
    redirect("/accept-terms?next=/onboarding");
  }

  if (user.onboardingCompletedAt) {
    redirect("/app");
  }

  const initial: OnboardingInitial = {
    name: user.name,
    country: user.country,
    usageReasons: user.usageReasons,
    primaryCurrency: user.primaryCurrency,
    primaryCurrencyConfirmedAt: user.primaryCurrencyConfirmedAt?.toISOString() ?? null,
  };

  return <OnboardingWizard initial={initial} />;
}
