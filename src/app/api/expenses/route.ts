import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { parseMonthKey } from "@/lib/months";
import { requireUserId } from "@/lib/session";
import { expenseSchema } from "@/lib/validators";

export async function GET() {
  return withApi(async () => {
    const userId = await requireUserId();
    const expenses = await db.expense.findMany({
      where: { userId },
      include: { bank: true },
      orderBy: [{ name: "asc" }],
    });
    return { expenses };
  });
}

export async function POST(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const body = await request.json();
    const payload = expenseSchema.parse(body);

    const bank = await db.bank.findFirst({ where: { id: payload.bankId, userId } });
    if (!bank) {
      return jsonError("Selected bank does not exist.", 404);
    }

    const expense = await db.expense.create({
      data: {
        userId,
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

    return new Response(JSON.stringify({ expense }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  });
}
