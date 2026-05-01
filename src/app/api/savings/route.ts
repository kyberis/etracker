import { Prisma, SavingsMovementKind } from "@prisma/client";

import { db } from "@/lib/db";
import { parseIsoDate } from "@/lib/expense-line";
import { jsonError, withApi } from "@/lib/http";
import { getSavingsState, recordSavingsMovement } from "@/lib/savings";
import { requireUserId } from "@/lib/session";
import { savingsMovementCreateSchema } from "@/lib/validators";

/**
 * GET /api/savings — devuelve el balance global de ahorros y los últimos N
 * movimientos del ledger (más recientes primero).
 */
export async function GET(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const url = new URL(request.url);
    const rawLimit = url.searchParams.get("limit");
    const limit = Math.min(
      200,
      Math.max(1, Number.parseInt(rawLimit ?? "50", 10) || 50),
    );
    return getSavingsState(userId, { limit });
  });
}

/**
 * POST /api/savings — crea un movimiento manual (depósito o retiro). El
 * monto en el body es siempre positivo; el signo se aplica server-side
 * según `kind` (MANUAL_DEPOSIT entra +, MANUAL_WITHDRAWAL sale −).
 */
export async function POST(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const body = await request.json();
    const payload = savingsMovementCreateSchema.parse(body);

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { primaryCurrency: true, savings: true },
    });
    if (!user) return jsonError("Usuario no encontrado.", 404);

    const magnitude = new Prisma.Decimal(payload.amount.toFixed(2));
    const signedAmount =
      payload.kind === SavingsMovementKind.MANUAL_WITHDRAWAL
        ? magnitude.negated()
        : magnitude;

    if (
      payload.kind === SavingsMovementKind.MANUAL_WITHDRAWAL &&
      user.savings.lessThan(magnitude)
    ) {
      return jsonError(
        `No alcanza la pila de ahorros (${user.savings.toString()}) para retirar ${magnitude.toString()}.`,
        409,
      );
    }

    const occurredOn = parseIsoDate(payload.occurredOn) ?? undefined;

    const result = await recordSavingsMovement({
      userId,
      kind: payload.kind,
      amount: signedAmount,
      currency: user.primaryCurrency,
      note: payload.note ?? null,
      occurredOn,
    });

    return new Response(
      JSON.stringify({
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
        balance: result.balance,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  });
}
