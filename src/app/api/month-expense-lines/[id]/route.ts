import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/expense-line";
import { FxUnavailableError, convertToPrimary } from "@/lib/fx/rates";
import { jsonError, withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { monthExpenseLineUpdateSchema } from "@/lib/validators";
import { expireYearTimeline } from "@/lib/year-timeline-data";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { id } = await context.params;
    const body = await request.json();
    const payload = monthExpenseLineUpdateSchema.parse(body);

    const line = await db.monthExpenseLine.findFirst({
      where: { id, monthRecord: { userId } },
      include: { monthRecord: { select: { month: true, userId: true } } },
    });
    if (!line) {
      return jsonError("Line not found.", 404);
    }

    const data: {
      paid?: boolean;
      name?: string;
      amount?: Prisma.Decimal;
      currency?: string;
      fxRate?: Prisma.Decimal;
      amountConverted?: Prisma.Decimal;
    } = {};
    if (payload.paid !== undefined) data.paid = payload.paid;
    if (payload.name !== undefined) data.name = payload.name;

    // FX-affecting fields: any change to amount/currency/fxRate triggers a
    // re-conversion. The rate stays "locked" only when no FX-bearing field
    // changes — editing the amount alone reuses the existing rate, which is
    // what we want for "fix a typo" flows.
    const amountChanged = payload.amount !== undefined;
    const currencyChanged = payload.currency !== undefined;
    const rateChanged = payload.fxRate !== undefined;

    if (amountChanged || currencyChanged || rateChanged) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { primaryCurrency: true },
      });
      if (!user) return jsonError("Usuario no encontrado.", 404);

      const nextCurrency = payload.currency ?? line.currency;
      const nextAmount = payload.amount ?? Number(line.amount);
      // When the user changes currency without supplying a new rate, fetch a
      // fresh one. When they just tweak the amount, keep the locked rate.
      const useExistingRate =
        !currencyChanged &&
        !rateChanged &&
        amountChanged &&
        nextCurrency.toUpperCase() === line.currency.toUpperCase();

      try {
        const converted = await convertToPrimary({
          amount: nextAmount,
          currency: nextCurrency,
          primary: user.primaryCurrency,
          fxRate: useExistingRate ? line.fxRate : payload.fxRate,
        });
        data.amount = converted.amount;
        data.currency = converted.currency;
        data.fxRate = converted.fxRate;
        data.amountConverted = converted.amountConverted;
      } catch (error) {
        if (error instanceof FxUnavailableError) {
          return jsonError(
            `No pudimos obtener el tipo de cambio ${error.from}->${error.to}. Probá pasando un fxRate manual.`,
            502,
          );
        }
        throw error;
      }
    }

    if (Object.keys(data).length === 0) {
      return jsonError("Nothing to update.", 400);
    }

    let updated;
    try {
      updated = await db.monthExpenseLine.update({ where: { id }, data });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return jsonError(
          "Ya tenés un gasto con esa fecha, descripción y monto. No puedo dejarlo idéntico a otro.",
          409,
        );
      }
      throw error;
    }
    await expireYearTimeline(userId, line.monthRecord.month.getUTCFullYear());
    return { line: updated };
  });
}
