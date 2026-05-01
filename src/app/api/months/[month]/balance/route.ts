import { db } from "@/lib/db";
import { withApi } from "@/lib/http";
import { isCurrentMonthKey, parseMonthKey, toMonthStart } from "@/lib/months";
import { requireUserId } from "@/lib/session";
import { monthParamSchema } from "@/lib/validators";

export type BalanceResponse = {
  month: string;
  hasRecord: boolean;
  isCurrentMonth: boolean;
  income: number;
  /** Amount carried over from the previous month, already included in `balance`. */
  carryoverFromPrev: number;
  /** ISO 4217 primary currency for the displayed totals. */
  primaryCurrency: string;
  totals: { planned: number; paid: number; remaining: number };
  balance: number;
};

/**
 * Lightweight read used by `BalanceProvider` to keep the sticky header in
 * sync. Avoids the full month page payload (lines, banks, pending
 * templates) so we can refresh on every AI tool call cheaply.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ month: string }> }) {
  return withApi(async (): Promise<BalanceResponse> => {
    const userId = await requireUserId();
    const { month: monthParam } = await ctx.params;
    const { month: monthKey } = monthParamSchema.parse({ month: monthParam });
    const monthStart = toMonthStart(parseMonthKey(monthKey));

    const [record, user] = await Promise.all([
      db.monthRecord.findFirst({
        where: { userId, month: monthStart },
        select: {
          carryoverFromPrev: true,
          // Only fields we need for the totals; avoids loading bank rows.
          // We aggregate `amountConverted` so totals are always in the user's
          // primary currency regardless of per-line currency.
          lines: { select: { amountConverted: true, paid: true } },
          // Income lines: la fuente de verdad de cuánto entró (received) y
          // cuánto se espera (todas).
          incomeLines: { select: { amountConverted: true, received: true } },
        },
      }),
      db.user.findUnique({ where: { id: userId }, select: { primaryCurrency: true } }),
    ]);
    const primaryCurrency = user?.primaryCurrency ?? "USD";

    if (!record) {
      return {
        month: monthKey,
        hasRecord: false,
        isCurrentMonth: isCurrentMonthKey(monthKey),
        income: 0,
        carryoverFromPrev: 0,
        primaryCurrency,
        totals: { planned: 0, paid: 0, remaining: 0 },
        balance: 0,
      };
    }

    let planned = 0;
    let paid = 0;
    for (const line of record.lines) {
      const amount = Number(line.amountConverted);
      planned += amount;
      if (line.paid) paid += amount;
    }
    let income = 0;
    for (const line of record.incomeLines) {
      if (line.received) income += Number(line.amountConverted);
    }
    const carryoverFromPrev = Number(record.carryoverFromPrev);

    return {
      month: monthKey,
      hasRecord: true,
      isCurrentMonth: isCurrentMonthKey(monthKey),
      income,
      carryoverFromPrev,
      primaryCurrency,
      totals: { planned, paid, remaining: planned - paid },
      balance: income + carryoverFromPrev - planned,
    };
  });
}
