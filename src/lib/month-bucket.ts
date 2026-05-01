import {
  type Expense,
  type ExpenseCategory,
  Prisma,
  SavingsMovementKind,
} from "@prisma/client";

import { db } from "@/lib/db";
import type { PendingTemplateExpense } from "@/lib/month-page-types";
import { expenseAppliesToMonth, parseMonthKey, toMonthStart } from "@/lib/months";
import {
  coverMonthDebt as coverMonthDebtFromSavingsService,
  recordSavingsMovement,
} from "@/lib/savings";

type LineInput = {
  templateId: string | null;
  bankId: string;
  name: string;
  amount: Prisma.Decimal;
  /** Templates are always in the user's primary currency (no FX). */
  currency: string;
  fxRate: Prisma.Decimal;
  amountConverted: Prisma.Decimal;
  category: ExpenseCategory;
  paid: boolean;
};

function linesFromExpenses(
  expenses: Expense[],
  month: Date,
  paidForTemplate: (templateId: string) => boolean,
  primaryCurrency: string,
): LineInput[] {
  return expenses
    .filter((e) => expenseAppliesToMonth(e, month))
    .map((e) => ({
      templateId: e.id,
      bankId: e.bankId,
      name: e.name,
      amount: e.amount,
      currency: primaryCurrency,
      fxRate: new Prisma.Decimal(1),
      amountConverted: e.amount,
      category: e.category,
      paid: paidForTemplate(e.id),
    }));
}

/**
 * All expense templates that apply to a calendar month, as create-many payloads.
 * No rows are marked paid.
 */
export async function templateLinesForMonth(userId: string, month: Date) {
  const [user, expenses] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { primaryCurrency: true } }),
    db.expense.findMany({ where: { userId } }),
  ]);
  if (!user) throw new Error("USER_NOT_FOUND");
  return linesFromExpenses(expenses, month, () => false, user.primaryCurrency);
}

export async function createMonthFromTemplates(userId: string, monthKey: string) {
  const month = parseMonthKey(monthKey);
  const start = toMonthStart(month);
  const existing = await db.monthRecord.findFirst({
    where: { userId, month: start },
  });
  if (existing) {
    return { type: "exists" as const, record: existing };
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  const expenses = await db.expense.findMany({ where: { userId } });
  const lineData = linesFromExpenses(expenses, month, () => false, user.primaryCurrency);

  return {
    type: "created" as const,
    record: await db.monthRecord.create({
      data: {
        userId,
        month: start,
        income: user.monthlyIncome,
        lines: {
          create: lineData.map((l) => ({
            userId,
            templateId: l.templateId,
            bankId: l.bankId,
            name: l.name,
            // Stub de plantilla: la fecha "real" todavía no existe, así que
            // usamos el primer día del mes. `templateId` está seteado, así
            // que el índice único parcial (templateId IS NULL) las ignora.
            occurredOn: start,
            amount: l.amount,
            currency: l.currency,
            fxRate: l.fxRate,
            amountConverted: l.amountConverted,
            category: l.category,
            paid: l.paid,
          })),
        },
      },
      include: {
        lines: { include: { bank: true, template: true } },
      },
    }),
  };
}

export async function createMonthFromCopy(
  userId: string,
  targetMonthKey: string,
  sourceMonthKey: string,
) {
  const target = parseMonthKey(targetMonthKey);
  const source = parseMonthKey(sourceMonthKey);
  const targetStart = toMonthStart(target);
  const sourceStart = toMonthStart(source);

  const existing = await db.monthRecord.findFirst({
    where: { userId, month: targetStart },
  });
  if (existing) {
    return { type: "exists" as const, record: existing };
  }

  const sourceRecord = await db.monthRecord.findFirst({
    where: { userId, month: sourceStart },
    include: { lines: true },
  });
  if (!sourceRecord) {
    throw new Error("SOURCE_NOT_FOUND");
  }

  return {
    type: "created" as const,
    record: await db.monthRecord.create({
      data: {
        userId,
        month: targetStart,
        income: sourceRecord.income,
        lines: {
          create: sourceRecord.lines.map((l) => ({
            userId,
            templateId: l.templateId,
            bankId: l.bankId,
            name: l.name,
            // Al copiar un mes a otro, las líneas son stubs nuevos (sin
            // pago real todavía); arrancan con el 1 del mes destino. Las
            // que vienen de plantilla quedan fuera del índice único; las
            // sueltas (templateId null) se diferencian del original
            // porque quedan en otro `occurredOn`.
            occurredOn: targetStart,
            amount: l.amount,
            currency: l.currency,
            fxRate: l.fxRate,
            amountConverted: l.amountConverted,
            category: l.category,
            paid: l.paid,
          })),
        },
      },
      include: {
        lines: { include: { bank: true, template: true } },
      },
    }),
  };
}

export async function findPreviousMonthWithRecord(userId: string, beforeMonth: Date) {
  const start = toMonthStart(beforeMonth);
  return db.monthRecord.findFirst({
    where: {
      userId,
      month: { lt: start },
    },
    orderBy: { month: "desc" },
  });
}

/**
 * Saldo de caja firmado del mes anterior con registro:
 * `(income + carryoverFromPrev) − sum(paid line.amountConverted)`.
 *
 * Positivo → sobró plata (decisión "qué hacer con el sobrante").
 * Negativo → cerró en rojo (decisión "cubrir con ahorro o arrastrar deuda").
 * Cero → no hay decisión que tomar.
 *
 * Devuelve `null` cuando no hay mes previo con registro.
 */
export async function getPrevMonthBalance(
  userId: string,
  currentMonth: Date,
): Promise<{
  prevMonthKey: string;
  prevMonthRecordId: string;
  amount: number;
} | null> {
  const prev = await db.monthRecord.findFirst({
    where: { userId, month: { lt: toMonthStart(currentMonth) } },
    orderBy: { month: "desc" },
    select: {
      id: true,
      month: true,
      income: true,
      carryoverFromPrev: true,
      lines: { select: { amountConverted: true, paid: true } },
    },
  });
  if (!prev) return null;

  const available = Number(prev.income) + Number(prev.carryoverFromPrev);
  const paid = prev.lines.reduce(
    (sum, line) => (line.paid ? sum + Number(line.amountConverted) : sum),
    0,
  );
  return {
    prevMonthKey: `${prev.month.getUTCFullYear()}-${String(prev.month.getUTCMonth() + 1).padStart(2, "0")}`,
    prevMonthRecordId: prev.id,
    amount: available - paid,
  };
}

/**
 * Compatibilidad histórica: solo devuelve el sobrante POSITIVO del mes
 * anterior (`null` cuando es ≤ 0). Se mantiene para callers que solo se
 * preocupan del flujo "hubo sobrante". Para flujos que también manejan
 * el caso negativo (cobertura desde ahorro) usar `getPrevMonthBalance`.
 */
export async function getPrevMonthLeftover(
  userId: string,
  currentMonth: Date,
): Promise<{ prevMonthKey: string; amount: number } | null> {
  const balance = await getPrevMonthBalance(userId, currentMonth);
  if (!balance || balance.amount <= 0) return null;
  return { prevMonthKey: balance.prevMonthKey, amount: balance.amount };
}

export type CarryoverDecisionMode =
  | "addToIncome"
  | "setAside"
  | "coverFromSavings"
  | "carryDebt";

export type CarryoverDecisionResult =
  | {
      type: "applied";
      mode: CarryoverDecisionMode;
      /** Sobrante firmado del mes anterior. Positivo = sobró; negativo = deuda. */
      leftover: number;
      /** Cuánto se cubrió desde ahorros (solo `coverFromSavings`). */
      covered?: number;
      /** Deuda neta arrastrada al mes actual (≥ 0). */
      remainingDebt?: number;
    }
  | { type: "alreadyDecided" }
  | { type: "noLeftover" }
  | { type: "noRecord" }
  | { type: "modeMismatch"; expected: "leftover" | "deficit" };

/**
 * Aplica la decisión del usuario sobre el saldo del mes anterior al mes
 * actual. Maneja tanto el caso de sobrante (positivo) como el de deuda
 * (negativo). Sea cual sea el resultado, sella `carryoverDecidedAt` para
 * que el prompt no vuelva a aparecer en este mes.
 *
 * - `addToIncome` (sobrante): suma el sobrante a `MonthRecord.carryoverFromPrev`.
 * - `setAside` (sobrante): suma a la pila de ahorros vía
 *   `recordSavingsMovement(CARRYOVER_DEPOSIT)`.
 * - `coverFromSavings` (deuda): retira `min(savings, |deuda|)` de la pila
 *   (movimiento `DEBT_COVERAGE`) y deja la deuda restante (si la hay)
 *   como `carryoverFromPrev` negativo en el mes actual.
 * - `carryDebt` (deuda): no toca la pila; deja la deuda completa como
 *   `carryoverFromPrev` negativo en el mes actual.
 *
 * Devuelve `modeMismatch` cuando el `mode` no concuerda con el signo del
 * sobrante (p. ej. `coverFromSavings` cuando sobró plata).
 */
export async function applyPrevMonthLeftoverDecision(
  userId: string,
  monthKey: string,
  mode: CarryoverDecisionMode,
): Promise<CarryoverDecisionResult> {
  const month = parseMonthKey(monthKey);
  const start = toMonthStart(month);

  const [record, user] = await Promise.all([
    db.monthRecord.findFirst({
      where: { userId, month: start },
      select: { id: true, carryoverDecidedAt: true },
    }),
    db.user.findUnique({
      where: { id: userId },
      select: { primaryCurrency: true },
    }),
  ]);
  if (!record) return { type: "noRecord" };
  if (record.carryoverDecidedAt) return { type: "alreadyDecided" };

  const balance = await getPrevMonthBalance(userId, month);
  if (!balance || balance.amount === 0) {
    // No hay decisión que tomar: marcamos como decidida y salimos.
    await db.monthRecord.update({
      where: { id: record.id },
      data: { carryoverDecidedAt: new Date() },
    });
    return { type: "noLeftover" };
  }

  const isPositive = balance.amount > 0;
  const expectsLeftover = mode === "addToIncome" || mode === "setAside";
  const expectsDeficit = mode === "coverFromSavings" || mode === "carryDebt";
  if (isPositive && !expectsLeftover) {
    return { type: "modeMismatch", expected: "leftover" };
  }
  if (!isPositive && !expectsDeficit) {
    return { type: "modeMismatch", expected: "deficit" };
  }

  const primaryCurrency = user?.primaryCurrency ?? "USD";
  const absAmount = new Prisma.Decimal(Math.abs(balance.amount).toFixed(2));

  if (mode === "addToIncome") {
    await db.monthRecord.update({
      where: { id: record.id },
      data: {
        carryoverFromPrev: absAmount,
        carryoverDecidedAt: new Date(),
      },
    });
    return { type: "applied", mode, leftover: balance.amount };
  }

  if (mode === "setAside") {
    await db.$transaction(async (tx) => {
      await recordSavingsMovement(
        {
          userId,
          kind: SavingsMovementKind.CARRYOVER_DEPOSIT,
          amount: absAmount,
          currency: primaryCurrency,
          monthRecordId: balance.prevMonthRecordId,
          note: null,
        },
        tx,
      );
      await tx.monthRecord.update({
        where: { id: record.id },
        data: { carryoverDecidedAt: new Date() },
      });
    });
    return { type: "applied", mode, leftover: balance.amount };
  }

  if (mode === "carryDebt") {
    // Deuda completa al mes actual como carryover negativo.
    await db.monthRecord.update({
      where: { id: record.id },
      data: {
        carryoverFromPrev: absAmount.negated(),
        carryoverDecidedAt: new Date(),
      },
    });
    return {
      type: "applied",
      mode,
      leftover: balance.amount,
      remainingDebt: Number(absAmount),
    };
  }

  // mode === "coverFromSavings"
  const coverage = await coverMonthDebtFromSavingsService({
    userId,
    monthRecordId: balance.prevMonthRecordId,
    deficit: absAmount,
    currency: primaryCurrency,
  });
  const remainingDebtDecimal = new Prisma.Decimal(coverage.remainingDebt.toFixed(2));
  await db.monthRecord.update({
    where: { id: record.id },
    data: {
      carryoverFromPrev: remainingDebtDecimal.negated(),
      carryoverDecidedAt: new Date(),
    },
  });
  return {
    type: "applied",
    mode,
    leftover: balance.amount,
    covered: coverage.covered,
    remainingDebt: coverage.remainingDebt,
  };
}

/**
 * Expense templates that apply to the month and are not yet represented
 * as a line linked to that template (`templateId`) in the bucket.
 */
export async function listPendingTemplateExpensesForMonth(
  userId: string,
  monthKey: string,
  existingLineTemplateIds: Set<string>,
): Promise<PendingTemplateExpense[]> {
  const month = parseMonthKey(monthKey);
  const expenses = await db.expense.findMany({
    where: { userId },
    include: { bank: { select: { name: true } } },
  });
  const pending: PendingTemplateExpense[] = [];
  for (const e of expenses) {
    if (!expenseAppliesToMonth(e, month)) {
      continue;
    }
    if (existingLineTemplateIds.has(e.id)) {
      continue;
    }
    pending.push({
      templateId: e.id,
      name: e.name,
      amount: e.amount.toString(),
      bankId: e.bankId,
      bankName: e.bank.name,
      category: e.category,
    });
  }
  return pending;
}

/**
 * Create month lines for every template that applies but is still missing. Idempotent.
 */
export async function mergePendingTemplateLinesIntoMonth(userId: string, monthKey: string) {
  const start = toMonthStart(parseMonthKey(monthKey));
  const monthRecord = await db.monthRecord.findFirst({
    where: { userId, month: start },
    include: { lines: { select: { templateId: true } } },
  });
  if (!monthRecord) {
    throw new Error("NO_RECORD");
  }
  const existing = new Set(
    monthRecord.lines
      .map((l) => l.templateId)
      .filter((id): id is string => Boolean(id)),
  );
  const pending = await listPendingTemplateExpensesForMonth(userId, monthKey, existing);
  if (pending.length === 0) {
    return { added: 0 };
  }
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { primaryCurrency: true },
  });
  const primaryCurrency = user?.primaryCurrency ?? "USD";
  await db.$transaction(
    pending.map((p) => {
      const amount = new Prisma.Decimal(p.amount);
      return db.monthExpenseLine.create({
        data: {
          userId,
          monthRecordId: monthRecord.id,
          templateId: p.templateId,
          bankId: p.bankId,
          name: p.name,
          occurredOn: start,
          amount,
          currency: primaryCurrency,
          fxRate: new Prisma.Decimal(1),
          amountConverted: amount,
          category: p.category as ExpenseCategory,
          paid: false,
        },
      });
    }),
  );
  return { added: pending.length };
}
