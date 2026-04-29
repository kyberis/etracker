import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { LINK_CODE_TTL_MINUTES } from "@/lib/whatsapp/link";
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
  const now = new Date();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      country: true,
      usageReasons: true,
      primaryCurrency: true,
      primaryCurrencyConfirmedAt: true,
      whatsappPhone: true,
      whatsappVerifiedAt: true,
      whatsappLinkCode: true,
      whatsappLinkCodeExpires: true,
      onboardingCompletedAt: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  if (user.onboardingCompletedAt) {
    redirect("/app");
  }

  const pendingLink =
    user.whatsappLinkCode &&
    user.whatsappLinkCodeExpires &&
    user.whatsappLinkCodeExpires > now;

  const initial: OnboardingInitial = {
    name: user.name,
    country: user.country,
    usageReasons: user.usageReasons,
    primaryCurrency: user.primaryCurrency,
    primaryCurrencyConfirmedAt: user.primaryCurrencyConfirmedAt?.toISOString() ?? null,
    whatsapp: {
      phone: user.whatsappVerifiedAt ? user.whatsappPhone : null,
      verifiedAt: user.whatsappVerifiedAt?.toISOString() ?? null,
      pendingCode: pendingLink ? user.whatsappLinkCode : null,
      pendingExpiresAt: pendingLink ? user.whatsappLinkCodeExpires!.toISOString() : null,
    },
    whatsappLinkTtlMinutes: LINK_CODE_TTL_MINUTES,
  };

  return <OnboardingWizard initial={initial} />;
}
