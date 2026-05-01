import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { parseMonthKey } from "@/lib/months";
import { requireUserId } from "@/lib/session";
import { incomeSchema } from "@/lib/validators";

/**
 * REST espejo de `/api/expenses` para plantillas de ingreso.
 *
 * `bankId` es opcional: a diferencia de los gastos, no exigimos cuenta para
 * registrar un cobro recurrente. Cuando viene seteado validamos que sea del
 * usuario; cuando no, persistimos `null`.
 */
export async function GET() {
  return withApi(async () => {
    const userId = await requireUserId();
    const incomes = await db.income.findMany({
      where: { userId },
      include: { bank: true },
      orderBy: [{ name: "asc" }],
    });
    return { incomes };
  });
}

export async function POST(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const body = await request.json();
    const payload = incomeSchema.parse(body);

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

    const income = await db.income.create({
      data: {
        userId,
        bankId: payload.bankId ?? null,
        name: payload.name.trim(),
        amount: new Prisma.Decimal(payload.amount.toFixed(2)),
        currency: payload.currency ?? user.primaryCurrency,
        isRecurring: payload.isRecurring,
        startMonth: parseMonthKey(payload.startMonth),
        endMonth: payload.endMonth ? parseMonthKey(payload.endMonth) : null,
        category: payload.category,
      },
      include: { bank: true },
    });

    return new Response(JSON.stringify({ income }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  });
}
