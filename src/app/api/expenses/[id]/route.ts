import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { parseMonthKey } from "@/lib/months";
import { requireUserId } from "@/lib/session";
import { expenseSchema } from "@/lib/validators";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { id } = await context.params;
    const body = await request.json();
    const payload = expenseSchema.parse(body);

    const existing = await db.expense.findFirst({ where: { id, userId } });
    if (!existing) {
      return jsonError("Expense not found.", 404);
    }

    const bank = await db.bank.findFirst({ where: { id: payload.bankId, userId } });
    if (!bank) {
      return jsonError("Selected bank does not exist.", 404);
    }

    const expense = await db.expense.update({
      where: { id },
      data: {
        bankId: payload.bankId,
        name: payload.name.trim(),
        amount: new Prisma.Decimal(payload.amount.toFixed(2)),
        isRecurring: payload.isRecurring,
        startMonth: parseMonthKey(payload.startMonth),
        endMonth: payload.endMonth ? parseMonthKey(payload.endMonth) : null,
        category: payload.category,
      },
      include: { bank: true },
    });

    return { expense };
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { id } = await context.params;

    const existing = await db.expense.findFirst({ where: { id, userId } });
    if (!existing) {
      return jsonError("Expense not found.", 404);
    }

    await db.expense.delete({ where: { id } });
    return { ok: true };
  });
}
