import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { loadMonthPageData } from "@/lib/month-page-data";
import { parseMonthKey, toMonthStart } from "@/lib/months";
import { requireUserId } from "@/lib/session";
import { monthlyIncomeSchema, monthParamSchema } from "@/lib/validators";
import { expireYearTimeline } from "@/lib/year-timeline-data";

export async function GET(_request: Request, context: { params: Promise<{ month: string }> }) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { month: monthParam } = await context.params;
    const { month: monthKey } = monthParamSchema.parse({ month: monthParam });
    return loadMonthPageData(userId, monthKey);
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ month: string }> }) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { month: monthParam } = await context.params;
    const { month: monthKey } = monthParamSchema.parse({ month: monthParam });
    const month = toMonthStart(parseMonthKey(monthKey));

    const body = await request.json();
    const payload = monthlyIncomeSchema.parse(body);

    const existing = await db.monthRecord.findFirst({
      where: { userId, month },
    });
    if (!existing) {
      return jsonError("Month not set up. Create the month first.", 404);
    }

    const record = await db.monthRecord.update({
      where: { id: existing.id },
      data: {
        income: new Prisma.Decimal(payload.amount.toFixed(2)),
      },
    });

    await expireYearTimeline(userId, month.getUTCFullYear());

    return {
      month: monthKey,
      income: Number(record.income),
    };
  });
}
