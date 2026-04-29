import bcrypt from "bcrypt";
import { cookies } from "next/headers";

import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { LOCALE_COOKIE } from "@/lib/i18n/locale";
import { requireUserId } from "@/lib/session";
import { settingsSchema } from "@/lib/validators";

export async function GET() {
  return withApi(async () => {
    const userId = await requireUserId();
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        expenseImportInstructions: true,
        passwordHash: true,
        primaryCurrency: true,
        primaryCurrencyConfirmedAt: true,
        locale: true,
        accounts: { select: { provider: true } },
      },
    });
    if (!user) {
      return jsonError("Usuario no encontrado.", 404);
    }

    return {
      user: {
        email: user.email,
        expenseImportInstructions: user.expenseImportInstructions,
        hasPassword: user.passwordHash != null,
        primaryCurrency: user.primaryCurrency,
        primaryCurrencyConfirmedAt: user.primaryCurrencyConfirmedAt?.toISOString() ?? null,
        locale: user.locale,
        linkedProviders: user.accounts.map((a) => a.provider),
      },
    };
  });
}

export async function PATCH(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const body = await request.json();
    const payload = settingsSchema.parse(body);

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return jsonError("Usuario no encontrado.", 404);
    }

    if (payload.newPassword) {
      if (user.passwordHash) {
        if (!payload.currentPassword) {
          return jsonError("Tenés que ingresar la contraseña actual.", 400);
        }
        const validCurrent = await bcrypt.compare(
          payload.currentPassword,
          user.passwordHash,
        );
        if (!validCurrent) {
          return jsonError("La contraseña actual no es correcta.", 401);
        }
      }
    }

    await db.user.update({
      where: { id: userId },
      data: {
        ...(payload.newPassword
          ? { passwordHash: await bcrypt.hash(payload.newPassword, 12) }
          : {}),
        ...(payload.expenseImportInstructions !== undefined
          ? { expenseImportInstructions: payload.expenseImportInstructions }
          : {}),
        // Setting the primary currency also marks the onboarding flag so the
        // agent stops prompting for it. It does NOT retroactively re-convert
        // existing lines (rates stay locked at the time they were created).
        ...(payload.primaryCurrency !== undefined
          ? {
              primaryCurrency: payload.primaryCurrency,
              primaryCurrencyConfirmedAt: new Date(),
            }
          : {}),
        ...(payload.locale !== undefined ? { locale: payload.locale } : {}),
      },
    });

    if (payload.locale !== undefined) {
      const cookieStore = await cookies();
      cookieStore.set(LOCALE_COOKIE, payload.locale, {
        path: "/",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return { ok: true };
  });
}
