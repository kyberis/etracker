import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { parseMonthKey } from "@/lib/months";
import { requireUserId } from "@/lib/session";
import { incomeSchema } from "@/lib/validators";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { id } = await context.params;
    const body = await request.json();
    const payload = incomeSchema.parse(body);

    const existing = await db.income.findFirst({ where: { id, userId } });
    if (!existing) {
      return jsonError("Income not found.", 404);
    }

    if (payload.bankId) {
      const bank = await db.bank.findFirst({
        where: { id: payload.bankId, userId },
      });
      if (!bank) {
        return jsonError("Selected bank does not exist.", 404);
      }
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { primaryCurrency: true },
    });
    if (!user) return jsonError("User not found.", 404);

    const income = await db.income.update({
      where: { id },
      data: {
        bankId: payload.bankId ?? null,
        name: payload.name.trim(),
        amount: new Prisma.Decimal(payload.amount.toFixed(2)),
        currency: payload.currency ?? existing.currency,
        isRecurring: payload.isRecurring,
        startMonth: parseMonthKey(payload.startMonth),
        endMonth: payload.endMonth ? parseMonthKey(payload.endMonth) : null,
        category: payload.category,
      },
      include: { bank: true },
    });

    return { income };
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { id } = await context.params;

    const existing = await db.income.findFirst({ where: { id, userId } });
    if (!existing) {
      return jsonError("Income not found.", 404);
    }

    await db.income.delete({ where: { id } });
    return { ok: true };
  });
}
