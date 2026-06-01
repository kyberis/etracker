import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { isUniqueViolation, parseIsoDate } from "@/lib/expense-line";
import { FxUnavailableError, convertToPrimary } from "@/lib/fx/rates";
import { jsonError, withApi } from "@/lib/http";
import {
  TemplateLineRebucketError,
  rebucketExpenseLineIfNeeded,
} from "@/lib/month-line-bucket";
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
      bankId?: string;
      category?: typeof payload.category;
      occurredOnSource?: typeof payload.occurredOnSource;
    } = {};
    if (payload.paid !== undefined) data.paid = payload.paid;
    if (payload.name !== undefined) data.name = payload.name;
    if (payload.category !== undefined) data.category = payload.category;
    if (payload.occurredOnSource !== undefined) {
      data.occurredOnSource = payload.occurredOnSource;
    }

    if (payload.bankId !== undefined) {
      const bank = await db.bank.findFirst({
        where: { id: payload.bankId, userId },
      });
      if (!bank) return jsonError("Bank not found.", 404);
      data.bankId = payload.bankId;
    }

    const amountChanged = payload.amount !== undefined;
    const currencyChanged = payload.currency !== undefined;
    const rateChanged = payload.fxRate !== undefined;

    if (amountChanged || currencyChanged || rateChanged) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { primaryCurrency: true },
      });
      if (!user) return jsonError("User not found.", 404);

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

    const parsedOccurredOn =
      payload.occurredOn !== undefined ? parseIsoDate(payload.occurredOn) : null;
    if (payload.occurredOn !== undefined && !parsedOccurredOn) {
      return jsonError("occurredOn must be yyyy-MM-dd.", 400);
    }

    const hasScalarUpdates = Object.keys(data).length > 0;
    if (!hasScalarUpdates && parsedOccurredOn === null) {
      return jsonError("Nothing to update.", 400);
    }

    let rebucketYear: number | null = null;
    if (parsedOccurredOn) {
      try {
        const rebucket = await rebucketExpenseLineIfNeeded(id, userId, parsedOccurredOn, {
          occurredOnSource: payload.occurredOnSource,
        });
        if (rebucket.rebucketed) {
          rebucketYear = parsedOccurredOn.getUTCFullYear();
        }
        if (payload.occurredOnSource !== undefined) {
          delete data.occurredOnSource;
        }
      } catch (error) {
        if (error instanceof TemplateLineRebucketError) {
          return jsonError(
            "Cannot move a template line to another month. Edit the date within the same month, or delete and re-add as a one-off line.",
            400,
          );
        }
        throw error;
      }
    }

    let updated = line;
    if (hasScalarUpdates) {
      try {
        updated = await db.monthExpenseLine.update({
          where: { id },
          data,
          include: { monthRecord: { select: { month: true, userId: true } } },
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          return jsonError(
            "An expense with the same date, description and amount already exists. Cannot leave two identical entries.",
            409,
          );
        }
        throw error;
      }
    } else if (parsedOccurredOn) {
      updated =
        (await db.monthExpenseLine.findFirst({
          where: { id, monthRecord: { userId } },
          include: { monthRecord: { select: { month: true, userId: true } } },
        })) ?? line;
    }

    const years = new Set<number>([line.monthRecord.month.getUTCFullYear()]);
    if (rebucketYear !== null) years.add(rebucketYear);
    await Promise.all([...years].map((year) => expireYearTimeline(userId, year)));

    return { line: updated };
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { id } = await context.params;

    const line = await db.monthExpenseLine.findFirst({
      where: { id, monthRecord: { userId } },
      include: { monthRecord: { select: { month: true } } },
    });
    if (!line) {
      return jsonError("Line not found.", 404);
    }

    await db.monthExpenseLine.delete({ where: { id } });
    await expireYearTimeline(userId, line.monthRecord.month.getUTCFullYear());
    return { ok: true };
  });
}
