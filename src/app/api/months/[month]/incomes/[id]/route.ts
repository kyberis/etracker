import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { isUniqueViolation, parseIsoDate } from "@/lib/expense-line";
import { FxUnavailableError, convertToPrimary } from "@/lib/fx/rates";
import { jsonError, withApi } from "@/lib/http";
import { parseMonthKey, toMonthStart } from "@/lib/months";
import { requireUserId } from "@/lib/session";
import {
  monthIncomeLineUpdateSchema,
  monthParamSchema,
} from "@/lib/validators";
import { expireYearTimeline } from "@/lib/year-timeline-data";

/**
 * Editar una línea de ingreso. Espejo de
 * `PATCH /api/month-expense-lines/[id]` con `received` reemplazando a `paid`.
 *
 * El path `…/months/[month]/incomes/[id]` valida que la línea pertenezca al
 * mes indicado (defensivo: el `id` ya alcanza para localizarla pero el
 * cliente conoce el mes y conviene chequear consistencia).
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ month: string; id: string }> },
) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { month: monthParam, id } = await context.params;
    const { month: monthKey } = monthParamSchema.parse({ month: monthParam });
    const monthStart = toMonthStart(parseMonthKey(monthKey));
    const body = await request.json();
    const payload = monthIncomeLineUpdateSchema.parse(body);

    const line = await db.monthIncomeLine.findFirst({
      where: { id, userId, monthRecord: { month: monthStart } },
      include: { monthRecord: { select: { month: true, userId: true } } },
    });
    if (!line) {
      return jsonError("Income line not found.", 404);
    }

    const data: {
      received?: boolean;
      name?: string;
      amount?: Prisma.Decimal;
      currency?: string;
      fxRate?: Prisma.Decimal;
      amountConverted?: Prisma.Decimal;
      bankId?: string | null;
      category?: typeof payload.category;
      occurredOn?: Date;
    } = {};
    if (payload.received !== undefined) data.received = payload.received;
    if (payload.name !== undefined) data.name = payload.name;
    if (payload.category !== undefined) data.category = payload.category;
    if (payload.occurredOn !== undefined) {
      const parsed = parseIsoDate(payload.occurredOn);
      if (!parsed) return jsonError("occurredOn debe ser yyyy-MM-dd.", 400);
      data.occurredOn = parsed;
    }
    if (payload.bankId !== undefined) {
      if (payload.bankId === null) {
        data.bankId = null;
      } else {
        const bank = await db.bank.findFirst({
          where: { id: payload.bankId, userId },
        });
        if (!bank) return jsonError("El banco no existe.", 404);
        data.bankId = payload.bankId;
      }
    }

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
            `Could not fetch exchange rate ${error.from}->${error.to}. Try passing fxRate manually.`,
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
      updated = await db.monthIncomeLine.update({ where: { id }, data });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return jsonError(
          "An income line with the same date, description and amount already exists. Cannot leave two identical entries.",
          409,
        );
      }
      throw error;
    }
    await expireYearTimeline(userId, line.monthRecord.month.getUTCFullYear());
    return { line: updated };
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ month: string; id: string }> },
) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { month: monthParam, id } = await context.params;
    const { month: monthKey } = monthParamSchema.parse({ month: monthParam });
    const monthStart = toMonthStart(parseMonthKey(monthKey));

    const line = await db.monthIncomeLine.findFirst({
      where: { id, userId, monthRecord: { month: monthStart } },
      include: { monthRecord: { select: { month: true } } },
    });
    if (!line) {
      return jsonError("Income line not found.", 404);
    }

    await db.monthIncomeLine.delete({ where: { id } });
    await expireYearTimeline(userId, line.monthRecord.month.getUTCFullYear());
    return { ok: true };
  });
}
