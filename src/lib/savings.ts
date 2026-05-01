import { Prisma, SavingsMovementKind } from "@prisma/client";

import { db } from "@/lib/db";
import { todayUtcDate } from "@/lib/expense-line";

/**
 * Servicio del ledger global de ahorros.
 *
 * `User.savings` es un cache denormalizado: el ledger inmutable vive en
 * `SavingsMovement`. Cada operación que mueve la pila pasa por
 * `recordSavingsMovement`, que dentro de la misma transacción inserta el
 * movimiento Y actualiza el cache. Así la pila siempre cuadra con
 * `SUM(amount)` del ledger del usuario.
 */

export type SavingsMovementInput = {
  userId: string;
  kind: SavingsMovementKind;
  /**
   * Monto FIRMADO en la moneda principal del usuario al momento de la llamada.
   * Positivo = entra a la pila. Negativo = sale (retiro / cobertura de deuda).
   */
  amount: Prisma.Decimal;
  /** Snapshot de la moneda principal del usuario. Se persiste tal cual. */
  currency: string;
  /** Mes vinculado al movimiento (opcional, contexto). */
  monthRecordId?: string | null;
  note?: string | null;
  /** Default: hoy (UTC, sin hora). */
  occurredOn?: Date;
};

/**
 * Inserta un movimiento en el ledger Y actualiza `User.savings` en una sola
 * transacción. Devuelve el movimiento creado y el balance resultante.
 *
 * Cuando se pasa un `tx` (Prisma transaction client) la operación se hace
 * dentro de esa misma transacción — útil para flujos como cobertura de deuda
 * que también tienen que actualizar `MonthRecord.carryoverFromPrev`.
 */
export async function recordSavingsMovement(
  input: SavingsMovementInput,
  tx?: Prisma.TransactionClient,
): Promise<{ movement: Prisma.SavingsMovementGetPayload<true>; balance: number }> {
  const occurredOn = input.occurredOn ?? todayUtcDate();
  const note = input.note?.trim() || null;

  const run = async (
    client: Prisma.TransactionClient,
  ): Promise<{
    movement: Prisma.SavingsMovementGetPayload<true>;
    balance: number;
  }> => {
    const movement = await client.savingsMovement.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        amount: input.amount,
        currency: input.currency,
        monthRecordId: input.monthRecordId ?? null,
        note,
        occurredOn,
      },
    });
    const updated = await client.user.update({
      where: { id: input.userId },
      data: { savings: { increment: input.amount } },
      select: { savings: true },
    });
    return { movement, balance: Number(updated.savings) };
  };

  if (tx) return run(tx);
  return db.$transaction(run);
}

/**
 * Borra un movimiento existente y revierte su efecto sobre `User.savings`.
 * Solo se debería invocar para movimientos MANUAL_* (los kinds del sistema
 * representan eventos del flujo de meses y borrarlos descuadraría el
 * histórico). Las API routes y tools que llaman acá ya filtran por kind.
 */
export async function deleteSavingsMovement(
  movementId: string,
  userId: string,
): Promise<{ ok: true; balance: number } | { ok: false; reason: "notFound" }> {
  return db.$transaction(async (tx) => {
    const existing = await tx.savingsMovement.findFirst({
      where: { id: movementId, userId },
      select: { id: true, amount: true },
    });
    if (!existing) return { ok: false as const, reason: "notFound" as const };
    await tx.savingsMovement.delete({ where: { id: existing.id } });
    const updated = await tx.user.update({
      where: { id: userId },
      data: { savings: { decrement: existing.amount } },
      select: { savings: true },
    });
    return { ok: true as const, balance: Number(updated.savings) };
  });
}

/**
 * Reemplaza el monto / nota de un movimiento existente y reajusta el cache
 * por la diferencia. Pensado para movimientos MANUAL_* (los del sistema no
 * deberían editarse a mano).
 */
export async function updateSavingsMovementAmount(
  movementId: string,
  userId: string,
  nextAmount: Prisma.Decimal,
  patch: { note?: string | null; occurredOn?: Date } = {},
): Promise<
  | { ok: true; balance: number }
  | { ok: false; reason: "notFound" }
> {
  return db.$transaction(async (tx) => {
    const existing = await tx.savingsMovement.findFirst({
      where: { id: movementId, userId },
      select: { id: true, amount: true },
    });
    if (!existing) return { ok: false as const, reason: "notFound" as const };
    const delta = nextAmount.minus(existing.amount);
    await tx.savingsMovement.update({
      where: { id: existing.id },
      data: {
        amount: nextAmount,
        ...(patch.note !== undefined ? { note: patch.note?.trim() || null } : {}),
        ...(patch.occurredOn !== undefined ? { occurredOn: patch.occurredOn } : {}),
      },
    });
    const updated = await tx.user.update({
      where: { id: userId },
      data: { savings: { increment: delta } },
      select: { savings: true },
    });
    return { ok: true as const, balance: Number(updated.savings) };
  });
}

/**
 * Upsert del aporte mensual informativo del usuario para un mes dado.
 * Garantiza un único movimiento de tipo MONTHLY_CONTRIBUTION por
 * (userId, monthRecordId). El monto es positivo (entrada a la pila) y NO
 * afecta el balance del mes (no se descuenta de `MonthRecord.income` ni
 * crea `MonthExpenseLine`).
 *
 * Estrategia: si ya existe un movimiento previo para el mismo (user, month,
 * kind), borramos el viejo y creamos el nuevo dentro de la misma
 * transacción para mantener el cache exacto sin acumular deltas.
 */
export async function setMonthlySavingsContribution(args: {
  userId: string;
  monthRecordId: string;
  amount: Prisma.Decimal;
  currency: string;
  note?: string | null;
  occurredOn?: Date;
}): Promise<{
  movement: Prisma.SavingsMovementGetPayload<true>;
  balance: number;
  replaced: boolean;
}> {
  const occurredOn = args.occurredOn ?? todayUtcDate();
  return db.$transaction(async (tx) => {
    const previous = await tx.savingsMovement.findFirst({
      where: {
        userId: args.userId,
        monthRecordId: args.monthRecordId,
        kind: SavingsMovementKind.MONTHLY_CONTRIBUTION,
      },
      select: { id: true, amount: true },
    });
    if (previous) {
      await tx.savingsMovement.delete({ where: { id: previous.id } });
      await tx.user.update({
        where: { id: args.userId },
        data: { savings: { decrement: previous.amount } },
      });
    }
    const { movement, balance } = await recordSavingsMovement(
      {
        userId: args.userId,
        kind: SavingsMovementKind.MONTHLY_CONTRIBUTION,
        amount: args.amount,
        currency: args.currency,
        monthRecordId: args.monthRecordId,
        note: args.note ?? null,
        occurredOn,
      },
      tx,
    );
    return { movement, balance, replaced: previous !== null };
  });
}

/**
 * Borra el aporte mensual del usuario para un mes (si existe) y revierte
 * su efecto sobre `User.savings`. Devuelve `removed: false` cuando no
 * había aporte registrado para ese mes.
 */
export async function removeMonthlySavingsContribution(args: {
  userId: string;
  monthRecordId: string;
}): Promise<{ removed: boolean; balance: number }> {
  return db.$transaction(async (tx) => {
    const previous = await tx.savingsMovement.findFirst({
      where: {
        userId: args.userId,
        monthRecordId: args.monthRecordId,
        kind: SavingsMovementKind.MONTHLY_CONTRIBUTION,
      },
      select: { id: true, amount: true },
    });
    if (!previous) {
      const user = await tx.user.findUnique({
        where: { id: args.userId },
        select: { savings: true },
      });
      return { removed: false, balance: Number(user?.savings ?? 0) };
    }
    await tx.savingsMovement.delete({ where: { id: previous.id } });
    const updated = await tx.user.update({
      where: { id: args.userId },
      data: { savings: { decrement: previous.amount } },
      select: { savings: true },
    });
    return { removed: true, balance: Number(updated.savings) };
  });
}

/**
 * Cubre la deuda de un mes (`prevMonthRecordId`) extrayendo de la pila lo
 * que se pueda. Si la pila es menor que la deuda, cubre lo que tiene y
 * devuelve `remainingDebt > 0`. Devuelve `covered = 0` si la pila está
 * vacía o si la deuda es 0/positiva (no hay nada que cubrir).
 *
 * Idempotente por mes vía `(userId, monthRecordId, DEBT_COVERAGE)` único:
 * si ya existe una cobertura para ese mes, la reemplaza por la nueva.
 */
export async function coverMonthDebt(args: {
  userId: string;
  monthRecordId: string;
  /** Monto positivo de la deuda a cubrir (valor absoluto del déficit). */
  deficit: Prisma.Decimal;
  currency: string;
  occurredOn?: Date;
}): Promise<{ covered: number; remainingDebt: number; balance: number }> {
  const occurredOn = args.occurredOn ?? todayUtcDate();
  if (args.deficit.lessThanOrEqualTo(0)) {
    const user = await db.user.findUnique({
      where: { id: args.userId },
      select: { savings: true },
    });
    return { covered: 0, remainingDebt: 0, balance: Number(user?.savings ?? 0) };
  }
  return db.$transaction(async (tx) => {
    // Borramos cobertura previa para ese mes (idempotencia + reemplazo).
    const previous = await tx.savingsMovement.findFirst({
      where: {
        userId: args.userId,
        monthRecordId: args.monthRecordId,
        kind: SavingsMovementKind.DEBT_COVERAGE,
      },
      select: { id: true, amount: true },
    });
    if (previous) {
      await tx.savingsMovement.delete({ where: { id: previous.id } });
      await tx.user.update({
        where: { id: args.userId },
        data: { savings: { decrement: previous.amount } },
      });
    }
    const user = await tx.user.findUnique({
      where: { id: args.userId },
      select: { savings: true },
    });
    const available = new Prisma.Decimal(user?.savings ?? 0);
    if (available.lessThanOrEqualTo(0)) {
      return {
        covered: 0,
        remainingDebt: Number(args.deficit),
        balance: Number(available),
      };
    }
    const cover = Prisma.Decimal.min(available, args.deficit);
    const signed = cover.negated();
    const { balance } = await recordSavingsMovement(
      {
        userId: args.userId,
        kind: SavingsMovementKind.DEBT_COVERAGE,
        amount: signed,
        currency: args.currency,
        monthRecordId: args.monthRecordId,
        note: null,
        occurredOn,
      },
      tx,
    );
    return {
      covered: Number(cover),
      remainingDebt: Number(args.deficit.minus(cover)),
      balance,
    };
  });
}

export type SavingsMovementPayload = {
  id: string;
  kind: SavingsMovementKind;
  /** Monto firmado en la moneda registrada al momento del movimiento. */
  amount: number;
  currency: string;
  note: string | null;
  monthRecordId: string | null;
  /** yyyy-MM cuando hay mes asociado, si no `null`. */
  monthKey: string | null;
  /** yyyy-MM-dd. */
  occurredOn: string;
  createdAt: string;
};

/**
 * Lee la pila + el ledger del usuario. `limit` aplica a los movimientos
 * (más recientes primero); el balance siempre es el del usuario.
 */
export async function getSavingsState(
  userId: string,
  options: { limit?: number } = {},
): Promise<{
  balance: number;
  currency: string;
  movements: SavingsMovementPayload[];
}> {
  const limit = options.limit ?? 50;
  const [user, movements] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { savings: true, primaryCurrency: true },
    }),
    db.savingsMovement.findMany({
      where: { userId },
      orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
      take: limit,
      include: { monthRecord: { select: { month: true } } },
    }),
  ]);
  return {
    balance: Number(user?.savings ?? 0),
    currency: user?.primaryCurrency ?? "USD",
    movements: movements.map((m) => ({
      id: m.id,
      kind: m.kind,
      amount: Number(m.amount),
      currency: m.currency,
      note: m.note,
      monthRecordId: m.monthRecordId,
      monthKey: m.monthRecord
        ? `${m.monthRecord.month.getUTCFullYear()}-${String(
            m.monthRecord.month.getUTCMonth() + 1,
          ).padStart(2, "0")}`
        : null,
      occurredOn: m.occurredOn.toISOString().slice(0, 10),
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export type ManualDuplicateGroup = {
  /** Hash legible del grupo (kind|amount|currency|occurredOn|note). */
  signature: string;
  kind: SavingsMovementKind;
  /** Monto firmado (positivo entra, negativo sale). */
  amount: number;
  currency: string;
  occurredOn: string;
  note: string | null;
  /** Movimiento que se preserva (el más antiguo por createdAt + id). */
  keeperId: string;
  /** Ids a borrar (todos menos el keeper). */
  duplicateIds: string[];
};

/** Clave canónica para agrupar duplicados. Trata note nulo y vacío como uno. */
function manualDuplicateSignature(m: {
  kind: SavingsMovementKind;
  amount: Prisma.Decimal;
  currency: string;
  occurredOn: Date;
  note: string | null;
}): string {
  const noteKey = m.note?.trim() ? m.note.trim() : "";
  return [
    m.kind,
    m.amount.toFixed(2),
    m.currency.toUpperCase(),
    m.occurredOn.toISOString().slice(0, 10),
    noteKey,
  ].join("|");
}

/**
 * Encuentra grupos de movimientos MANUAL_* duplicados para un usuario.
 *
 * Dos movimientos son "duplicados" si comparten `kind`, `amount` (firmado),
 * `currency`, `occurredOn` (yyyy-MM-dd) y `note` (tratando `null`/vacío
 * como equivalentes). Solo `MANUAL_DEPOSIT` y `MANUAL_WITHDRAWAL` entran
 * en la búsqueda — los kinds del sistema (MONTHLY_CONTRIBUTION,
 * CARRYOVER_DEPOSIT, DEBT_COVERAGE) ya tienen unicidad por
 * (userId, monthRecordId, kind) y no pueden duplicarse.
 *
 * El "keeper" de cada grupo es el movimiento más antiguo por
 * `createdAt` (desempate por id ascendente para que sea determinístico).
 */
export async function findManualDuplicateMovements(
  userId: string,
): Promise<ManualDuplicateGroup[]> {
  const movements = await db.savingsMovement.findMany({
    where: {
      userId,
      kind: {
        in: [
          SavingsMovementKind.MANUAL_DEPOSIT,
          SavingsMovementKind.MANUAL_WITHDRAWAL,
        ],
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      kind: true,
      amount: true,
      currency: true,
      occurredOn: true,
      note: true,
    },
  });

  const groups = new Map<string, typeof movements>();
  for (const m of movements) {
    const sig = manualDuplicateSignature(m);
    const bucket = groups.get(sig);
    if (bucket) {
      bucket.push(m);
    } else {
      groups.set(sig, [m]);
    }
  }

  const result: ManualDuplicateGroup[] = [];
  for (const [signature, bucket] of groups) {
    if (bucket.length < 2) continue;
    const [keeper, ...rest] = bucket;
    result.push({
      signature,
      kind: keeper.kind,
      amount: Number(keeper.amount),
      currency: keeper.currency,
      occurredOn: keeper.occurredOn.toISOString().slice(0, 10),
      note: keeper.note,
      keeperId: keeper.id,
      duplicateIds: rest.map((m) => m.id),
    });
  }
  return result;
}

/**
 * Borra una lista de ids del ledger del usuario en una sola transacción y
 * ajusta `User.savings` por el delta total. Solo borra movimientos
 * MANUAL_* que pertenezcan al usuario; ignora cualquier id ajeno o de
 * tipo del sistema (devuelve los conteos por separado).
 */
export async function deleteManualDuplicateMovements(
  userId: string,
  movementIds: string[],
): Promise<{
  deletedCount: number;
  skippedSystemKinds: number;
  skippedNotFound: number;
  balance: number;
}> {
  if (movementIds.length === 0) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { savings: true },
    });
    return {
      deletedCount: 0,
      skippedSystemKinds: 0,
      skippedNotFound: 0,
      balance: Number(user?.savings ?? 0),
    };
  }
  return db.$transaction(async (tx) => {
    const found = await tx.savingsMovement.findMany({
      where: { id: { in: movementIds }, userId },
      select: { id: true, kind: true, amount: true },
    });
    const skippedNotFound = movementIds.length - found.length;
    const deletable = found.filter(
      (m) =>
        m.kind === SavingsMovementKind.MANUAL_DEPOSIT ||
        m.kind === SavingsMovementKind.MANUAL_WITHDRAWAL,
    );
    const skippedSystemKinds = found.length - deletable.length;
    if (deletable.length === 0) {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { savings: true },
      });
      return {
        deletedCount: 0,
        skippedSystemKinds,
        skippedNotFound,
        balance: Number(user?.savings ?? 0),
      };
    }
    const delta = deletable.reduce(
      (acc, m) => acc.plus(m.amount),
      new Prisma.Decimal(0),
    );
    await tx.savingsMovement.deleteMany({
      where: { id: { in: deletable.map((m) => m.id) }, userId },
    });
    const updated = await tx.user.update({
      where: { id: userId },
      data: { savings: { decrement: delta } },
      select: { savings: true },
    });
    return {
      deletedCount: deletable.length,
      skippedSystemKinds,
      skippedNotFound,
      balance: Number(updated.savings),
    };
  });
}

/**
 * Vuelve a calcular `User.savings` como `SUM(SavingsMovement.amount)` para
 * el usuario indicado. Útil para backfill y para resincronizar si alguna
 * vez el cache se desfasa. No-op si no hay movimientos (deja en 0).
 */
export async function recomputeSavingsCache(userId: string): Promise<number> {
  const aggregate = await db.savingsMovement.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  const next = aggregate._sum.amount ?? new Prisma.Decimal(0);
  const updated = await db.user.update({
    where: { id: userId },
    data: { savings: next },
    select: { savings: true },
  });
  return Number(updated.savings);
}
