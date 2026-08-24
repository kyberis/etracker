import { Prisma } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { parseMonthKey } from "@/lib/months";
import { requireUserId } from "@/lib/session";
import { expenseSchema } from "@/lib/validators";

const bulkSchema = z.object({
  templates: z.array(expenseSchema).min(1).max(40),
});

/**
 * Create several recurring (or one-off) expense templates in one request.
 * Used by the in-chat recurring-picker widget after the user confirms.
 */
export async function POST(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const body = await request.json();
    const { templates } = bulkSchema.parse(body);

    const bankIds = [...new Set(templates.map((t) => t.bankId))];
    const banks = await db.bank.findMany({
      where: { userId, id: { in: bankIds } },
      select: { id: true, name: true },
    });
    const bankById = new Map(banks.map((b) => [b.id, b]));
    for (const id of bankIds) {
      if (!bankById.has(id)) {
        return jsonError(`Selected bank does not exist (${id}).`, 404);
      }
    }

    const created = await db.$transaction(
      templates.map((payload) =>
        db.expense.create({
          data: {
            userId,
            bankId: payload.bankId,
            name: payload.name.trim(),
            amount: new Prisma.Decimal(payload.amount.toFixed(2)),
            isRecurring: payload.isRecurring,
            startMonth: parseMonthKey(payload.startMonth),
            endMonth: payload.endMonth
              ? parseMonthKey(payload.endMonth)
              : null,
            category: payload.category,
          },
          include: { bank: { select: { id: true, name: true } } },
        }),
      ),
    );

    return new Response(
      JSON.stringify({
        ok: true,
        created: created.length,
        expenses: created.map((e) => ({
          id: e.id,
          name: e.name,
          amount: e.amount.toString(),
          isRecurring: e.isRecurring,
          bankName: e.bank.name,
          category: e.category,
        })),
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
    );
  });
}
