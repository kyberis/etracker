import { Prisma, SavingsMovementKind } from "@prisma/client";

import { db } from "@/lib/db";
import { parseIsoDate } from "@/lib/expense-line";
import { jsonError, withApi } from "@/lib/http";
import {
  deleteSavingsMovement,
  updateSavingsMovementAmount,
} from "@/lib/savings";
import { requireUserId } from "@/lib/session";
import { savingsMovementUpdateSchema } from "@/lib/validators";

const MUTABLE_KINDS = new Set<SavingsMovementKind>([
  SavingsMovementKind.MANUAL_DEPOSIT,
  SavingsMovementKind.MANUAL_WITHDRAWAL,
]);

/**
 * PATCH /api/savings/[id] — edita un movimiento MANUAL_*. Los movimientos
 * generados por el sistema (CARRYOVER_DEPOSIT, MONTHLY_CONTRIBUTION,
 * DEBT_COVERAGE) son inmutables: se gestionan deshaciendo la decisión que
 * los originó.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { id } = await context.params;
    const body = await request.json();
    const payload = savingsMovementUpdateSchema.parse(body);

    const existing = await db.savingsMovement.findFirst({
      where: { id, userId },
      select: { id: true, kind: true, amount: true },
    });
    if (!existing) return jsonError("Movimiento no encontrado.", 404);
    if (!MUTABLE_KINDS.has(existing.kind)) {
      return jsonError(
        "Este movimiento es del sistema y no se puede editar a mano.",
        409,
      );
    }

    let nextSigned: Prisma.Decimal | null = null;
    if (payload.amount !== undefined) {
      const magnitude = new Prisma.Decimal(payload.amount.toFixed(2));
      nextSigned =
        existing.kind === SavingsMovementKind.MANUAL_WITHDRAWAL
          ? magnitude.negated()
          : magnitude;
    }

    if (nextSigned === null && payload.note === undefined && payload.occurredOn === undefined) {
      return jsonError("Nada para actualizar.", 400);
    }

    const occurredOn = payload.occurredOn ? parseIsoDate(payload.occurredOn) : undefined;
    if (payload.occurredOn && !occurredOn) {
      return jsonError("occurredOn inválido (yyyy-MM-dd).", 400);
    }

    if (nextSigned !== null) {
      const result = await updateSavingsMovementAmount(
        id,
        userId,
        nextSigned,
        {
          ...(payload.note !== undefined ? { note: payload.note } : {}),
          ...(occurredOn ? { occurredOn } : {}),
        },
      );
      if (!result.ok) return jsonError("Movimiento no encontrado.", 404);
      return { ok: true, balance: result.balance };
    }

    // Solo metadata (note y/o fecha): no toca el cache, update directo.
    await db.savingsMovement.update({
      where: { id },
      data: {
        ...(payload.note !== undefined ? { note: payload.note?.trim() || null } : {}),
        ...(occurredOn ? { occurredOn } : {}),
      },
    });
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { savings: true },
    });
    return { ok: true, balance: Number(user?.savings ?? 0) };
  });
}

/**
 * DELETE /api/savings/[id] — borra un movimiento MANUAL_* y revierte su
 * efecto sobre la pila. Bloqueado para los kinds del sistema.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { id } = await context.params;

    const existing = await db.savingsMovement.findFirst({
      where: { id, userId },
      select: { id: true, kind: true },
    });
    if (!existing) return jsonError("Movimiento no encontrado.", 404);
    if (!MUTABLE_KINDS.has(existing.kind)) {
      return jsonError(
        "Este movimiento es del sistema y no se puede borrar a mano.",
        409,
      );
    }

    const result = await deleteSavingsMovement(id, userId);
    if (!result.ok) return jsonError("Movimiento no encontrado.", 404);
    return { ok: true, balance: result.balance };
  });
}
