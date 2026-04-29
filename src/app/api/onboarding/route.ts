import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { onboardingSchema } from "@/lib/validators";

/**
 * Persistencia parcial de los pasos del wizard de onboarding. Cada paso del
 * wizard manda solo lo que tiene; el último paso (o un "Saltar") agrega
 * `complete: true` para sellar `onboardingCompletedAt` y que el redirect gate
 * en `(app)/layout.tsx` deje de mandar al usuario al wizard.
 *
 * Side-effects:
 * - `primaryCurrency` también sella `primaryCurrencyConfirmedAt` (mismo
 *   comportamiento que `PATCH /api/settings`) para que el agente deje de
 *   preguntar por la moneda principal en el chat.
 * - `complete: true` sella `onboardingCompletedAt = now()`.
 *
 * Responde con el snapshot actualizado para que el cliente sincronice estado
 * sin un GET extra.
 */
export async function PATCH(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const body = await request.json();
    const payload = onboardingSchema.parse(body);

    const data: Prisma.UserUpdateInput = {};
    if (payload.name !== undefined) data.name = payload.name;
    if (payload.usageReasons !== undefined) data.usageReasons = { set: payload.usageReasons };
    if (payload.country !== undefined) data.country = payload.country;
    if (payload.primaryCurrency !== undefined) {
      data.primaryCurrency = payload.primaryCurrency;
      data.primaryCurrencyConfirmedAt = new Date();
    }
    if (payload.complete) {
      data.onboardingCompletedAt = new Date();
    }

    const updated = await db.user.update({
      where: { id: userId },
      data,
      select: {
        name: true,
        country: true,
        usageReasons: true,
        primaryCurrency: true,
        primaryCurrencyConfirmedAt: true,
        onboardingCompletedAt: true,
      },
    });

    return {
      user: {
        name: updated.name,
        country: updated.country,
        usageReasons: updated.usageReasons,
        primaryCurrency: updated.primaryCurrency,
        primaryCurrencyConfirmedAt: updated.primaryCurrencyConfirmedAt?.toISOString() ?? null,
        onboardingCompletedAt: updated.onboardingCompletedAt?.toISOString() ?? null,
      },
    };
  });
}
