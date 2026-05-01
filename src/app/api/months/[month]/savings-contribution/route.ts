import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { parseMonthKey, toMonthStart } from "@/lib/months";
import {
  removeMonthlySavingsContribution,
  setMonthlySavingsContribution,
} from "@/lib/savings";
import { requireUserId } from "@/lib/session";
import {
  monthParamSchema,
  monthlySavingsContributionSchema,
} from "@/lib/validators";

/**
 * POST /api/months/[month]/savings-contribution — upsert del aporte mensual
 * informativo. NO afecta el balance del mes; solo agrega un movimiento de
 * tipo MONTHLY_CONTRIBUTION a la pila global. El mes tiene que estar creado.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ month: string }> },
) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { month: monthParam } = await context.params;
    const { month: monthKey } = monthParamSchema.parse({ month: monthParam });
    const body = await request.json();
    const payload = monthlySavingsContributionSchema.parse(body);

    const monthStart = toMonthStart(parseMonthKey(monthKey));
    const [user, monthRecord] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: { primaryCurrency: true },
      }),
      db.monthRecord.findFirst({
        where: { userId, month: monthStart },
        select: { id: true },
      }),
    ]);
    if (!user) return jsonError("Usuario no encontrado.", 404);
    if (!monthRecord) {
      return jsonError(
        "This month is not set up yet. Set up the month first.",
        404,
      );
    }

    const result = await setMonthlySavingsContribution({
      userId,
      monthRecordId: monthRecord.id,
      amount: new Prisma.Decimal(payload.amount.toFixed(2)),
      currency: user.primaryCurrency,
      note: payload.note ?? null,
      occurredOn: monthStart,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        replaced: result.replaced,
        balance: result.balance,
        movement: {
          id: result.movement.id,
          kind: result.movement.kind,
          amount: Number(result.movement.amount),
          currency: result.movement.currency,
          note: result.movement.note,
          monthRecordId: result.movement.monthRecordId,
          occurredOn: result.movement.occurredOn.toISOString().slice(0, 10),
          createdAt: result.movement.createdAt.toISOString(),
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  });
}

/**
 * DELETE /api/months/[month]/savings-contribution — borra el aporte mensual
 * del mes (si existe) y revierte su efecto sobre la pila.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ month: string }> },
) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { month: monthParam } = await context.params;
    const { month: monthKey } = monthParamSchema.parse({ month: monthParam });

    const monthStart = toMonthStart(parseMonthKey(monthKey));
    const monthRecord = await db.monthRecord.findFirst({
      where: { userId, month: monthStart },
      select: { id: true },
    });
    if (!monthRecord) {
      return jsonError("This month is not set up yet.", 404);
    }

    const result = await removeMonthlySavingsContribution({
      userId,
      monthRecordId: monthRecord.id,
    });
    return { ok: true, removed: result.removed, balance: result.balance };
  });
}
