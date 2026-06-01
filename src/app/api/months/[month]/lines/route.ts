import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/expense-line";
import { FxUnavailableError, convertToPrimary } from "@/lib/fx/rates";
import { jsonError, withApi } from "@/lib/http";
import {
  MonthOccurredOnMismatchError,
  assertPathMonthMatchesOccurredOn,
  resolveCreateOccurredOn,
  resolveMonthRecordId,
} from "@/lib/month-line-bucket";
import { parseMonthKey } from "@/lib/months";
import { requireUserId } from "@/lib/session";
import { monthExpenseLineCreateSchema, monthParamSchema } from "@/lib/validators";
import { expireYearTimeline } from "@/lib/year-timeline-data";

export async function POST(request: Request, context: { params: Promise<{ month: string }> }) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { month: monthParam } = await context.params;
    const { month: monthKey } = monthParamSchema.parse({ month: monthParam });

    const body = await request.json();
    const payload = monthExpenseLineCreateSchema.parse(body);

    const { occurredOn, occurredOnSource } = resolveCreateOccurredOn(payload);
    try {
      assertPathMonthMatchesOccurredOn(monthKey, occurredOn);
    } catch (error) {
      if (error instanceof MonthOccurredOnMismatchError) {
        return jsonError(
          `Path month (${error.pathMonth}) does not match the expense date month (${error.occurredOnMonth}).`,
          400,
        );
      }
      throw error;
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { primaryCurrency: true },
    });
    if (!user) return jsonError("User not found.", 404);

    const bank = await db.bank.findFirst({ where: { id: payload.bankId, userId } });
    if (!bank) {
      return jsonError("Bank not found.", 404);
    }

    let converted;
    try {
      converted = await convertToPrimary({
        amount: payload.amount,
        currency: payload.currency ?? user.primaryCurrency,
        primary: user.primaryCurrency,
        fxRate: payload.fxRate,
      });
    } catch (error) {
      if (error instanceof FxUnavailableError) {
        return jsonError(
          `Could not fetch exchange rate ${error.from}->${error.to}. Try passing fxRate manually.`,
          502,
        );
      }
      throw error;
    }

    const monthRecordId = await resolveMonthRecordId(userId, occurredOn);
    const bucketMonth = parseMonthKey(monthKey);

    let line;
    try {
      line = await db.monthExpenseLine.create({
        data: {
          userId,
          monthRecordId,
          templateId: null,
          bankId: payload.bankId,
          name: payload.name.trim(),
          occurredOn,
          occurredOnSource,
          amount: converted.amount,
          currency: converted.currency,
          fxRate: converted.fxRate,
          amountConverted: converted.amountConverted,
          category: payload.category,
          paid: payload.paid ?? false,
        },
        include: { bank: { select: { name: true } } },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return jsonError(
          "An expense with the same date, description and amount already exists. Skipped to avoid duplicates.",
          409,
        );
      }
      throw error;
    }

    await expireYearTimeline(userId, bucketMonth.getUTCFullYear());

    return new Response(
      JSON.stringify({
        line: {
          id: line.id,
          name: line.name,
          amount: line.amount.toString(),
          currency: line.currency,
          fxRate: line.fxRate.toString(),
          amountConverted: line.amountConverted.toString(),
          bankId: line.bankId,
          bankName: line.bank.name,
          paid: line.paid,
          category: line.category,
          occurredOn: line.occurredOn.toISOString().slice(0, 10),
          occurredOnSource: line.occurredOnSource,
        },
        primaryCurrency: user.primaryCurrency,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  });
}
