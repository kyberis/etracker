import { z } from "zod";

import { db } from "@/lib/db";
import { FxUnavailableError, fetchFxRate } from "@/lib/fx/rates";
import { jsonError, withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { currencySchema } from "@/lib/validators";

const querySchema = z.object({
  from: currencySchema,
  to: currencySchema.optional(),
});

/**
 * GET /api/fx/rate?from=USD&to=EUR — returns the live (cached) FX rate.
 * When `to` is omitted, falls back to the user's `primaryCurrency`. Used by
 * the add-line dialog to preview "1 USD ≈ 0.91 EUR" before persisting.
 */
export async function GET(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const url = new URL(request.url);
    const parsed = querySchema.parse({
      from: url.searchParams.get("from") ?? "",
      to: url.searchParams.get("to") ?? undefined,
    });

    let to = parsed.to;
    if (!to) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { primaryCurrency: true },
      });
      if (!user) return jsonError("Usuario no encontrado.", 404);
      to = user.primaryCurrency;
    }

    try {
      const rate = await fetchFxRate(parsed.from, to);
      return { from: parsed.from, to, fxRate: rate.toString() };
    } catch (error) {
      if (error instanceof FxUnavailableError) {
        return jsonError(
          `No pudimos obtener el tipo de cambio ${error.from}->${error.to}.`,
          502,
        );
      }
      throw error;
    }
  });
}
