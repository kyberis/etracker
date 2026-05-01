import { SavingsMovementKind } from "@prisma/client";

import { getBanksCached } from "@/lib/cache/banks";
import {
  getPrevMonthBalance,
  listPendingTemplateExpensesForMonth,
  listPendingTemplateIncomesForMonth,
} from "@/lib/month-bucket";
import { formatMonthKey, isCurrentMonthKey, parseMonthKey, toMonthStart } from "@/lib/months";

import { db } from "./db";
import type {
  CarryoverPrompt,
  MonthIncomeLinePayload,
  MonthLinePayload,
  MonthPageData,
} from "./month-page-types";

export async function loadMonthPageData(userId: string, monthKey: string): Promise<MonthPageData> {
  const monthStart = parseMonthKey(monthKey);
  const monthForQuery = toMonthStart(monthStart);

  const [user, monthRecord, banks, incomeHistoryRows] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { monthlyIncome: true, primaryCurrency: true, savings: true },
    }),
    db.monthRecord.findFirst({
      where: { userId, month: monthForQuery },
      include: {
        // Más nuevo primero: la home cronológica del mes consume `expenses`
        // ya ordenado, y los grupos por banco que se calculan después
        // heredan ese orden dentro de cada banco.
        lines: {
          include: { bank: true },
          orderBy: { createdAt: "desc" },
        },
        incomeLines: {
          include: { bank: true },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    getBanksCached(userId),
    // Histórico de ingresos: últimos 12 meses con SUM(amountConverted) de
    // líneas recibidas. Reemplaza la lectura del campo legacy
    // `MonthRecord.income`.
    db.monthRecord.findMany({
      where: { userId },
      orderBy: { month: "desc" },
      take: 12,
      select: {
        month: true,
        incomeLines: {
          where: { received: true },
          select: { amountConverted: true },
        },
      },
    }),
  ]);

  const defaultIncome = user ? Number(user.monthlyIncome) : 0;
  const primaryCurrency = user?.primaryCurrency ?? "USD";
  const savings = user ? Number(user.savings) : 0;
  const history = incomeHistoryRows.map((m) => ({
    month: formatMonthKey(m.month),
    amount: m.incomeLines.reduce((s, l) => s + Number(l.amountConverted), 0),
  }));

  const isCurrentMonth = isCurrentMonthKey(monthKey);

  if (!monthRecord) {
    return {
      month: monthKey,
      hasRecord: false as const,
      defaultIncome,
      primaryCurrency,
      incomeHistory: history,
    };
  }

  const incomes: MonthIncomeLinePayload[] = monthRecord.incomeLines.map((line) => ({
    id: line.id,
    name: line.name,
    amount: line.amount.toString(),
    currency: line.currency,
    fxRate: line.fxRate.toString(),
    amountConverted: line.amountConverted.toString(),
    bankId: line.bankId,
    bankName: line.bank?.name ?? null,
    received: line.received,
    category: line.category,
    occurredOn: line.occurredOn.toISOString().slice(0, 10),
    createdAt: line.createdAt.toISOString(),
  }));

  const incomeReceived = incomes.reduce(
    (s, l) => (l.received ? s + Number(l.amountConverted) : s),
    0,
  );
  const incomeExpectedTotal = incomes.reduce(
    (s, l) => s + Number(l.amountConverted),
    0,
  );
  const carryoverFromPrev = Number(monthRecord.carryoverFromPrev);
  const effectiveIncome = incomeReceived + carryoverFromPrev;
  const expenses: MonthLinePayload[] = monthRecord.lines.map((line) => ({
    id: line.id,
    name: line.name,
    amount: line.amount.toString(),
    currency: line.currency,
    fxRate: line.fxRate.toString(),
    amountConverted: line.amountConverted.toString(),
    bankId: line.bankId,
    bankName: line.bank.name,
    paid: line.paid,
    category: line.category,
    createdAt: line.createdAt.toISOString(),
  }));

  // All aggregations work off `amountConverted` so totals stay in the user's
  // primary currency regardless of which currency individual lines were
  // entered in.
  const bankTotals = banks.map((bank) => {
    const entries = expenses.filter((e) => e.bankId === bank.id);
    const planned = entries.reduce((s, e) => s + Number(e.amountConverted), 0);
    const paid = entries
      .filter((e) => e.paid)
      .reduce((s, e) => s + Number(e.amountConverted), 0);
    return {
      bankId: bank.id,
      bankName: bank.name,
      color: bank.color,
      planned,
      paid,
    };
  });

  const totals = bankTotals.reduce(
    (acc, b) => {
      acc.planned += b.planned;
      acc.paid += b.paid;
      return acc;
    },
    { planned: 0, paid: 0 },
  );

  const balance = effectiveIncome - totals.planned;

  // Only the current month gets the leftover prompt: viewing past or future
  // months shouldn't reopen a decision that belongs to "today".
  let carryoverPrompt: CarryoverPrompt | null = null;
  if (isCurrentMonth && monthRecord.carryoverDecidedAt === null) {
    const prev = await getPrevMonthBalance(userId, monthForQuery);
    if (prev && prev.amount !== 0) {
      carryoverPrompt = {
        type: prev.amount > 0 ? "leftover" : "deficit",
        prevMonth: prev.prevMonthKey,
        amount: Math.abs(prev.amount),
        savings,
      };
    }
  }

  const existingTemplateIds = new Set(
    monthRecord.lines
      .map((l) => l.templateId)
      .filter((id): id is string => Boolean(id)),
  );
  const existingIncomeTemplateIds = new Set(
    monthRecord.incomeLines
      .map((l) => l.templateId)
      .filter((id): id is string => Boolean(id)),
  );
  const [pendingFromTemplates, pendingIncomesFromTemplates] = await Promise.all([
    listPendingTemplateExpensesForMonth(userId, monthKey, existingTemplateIds),
    listPendingTemplateIncomesForMonth(
      userId,
      monthKey,
      existingIncomeTemplateIds,
    ),
  ]);

  // Aporte mensual a ahorro (informativo): si existe, lo exponemos para
  // que la UI pueda mostrarlo como badge en el card de ahorros.
  const monthlyContribution = await db.savingsMovement.findFirst({
    where: {
      userId,
      monthRecordId: monthRecord.id,
      kind: SavingsMovementKind.MONTHLY_CONTRIBUTION,
    },
    select: { id: true, amount: true, note: true, occurredOn: true },
  });

  return {
    month: monthKey,
    hasRecord: true as const,
    defaultIncome,
    primaryCurrency,
    income: incomeReceived,
    incomeExpected: incomeExpectedTotal,
    carryoverFromPrev,
    effectiveIncome,
    carryoverPrompt,
    savings,
    isCurrentMonth,
    incomeHistory: history,
    totals: {
      planned: totals.planned,
      paid: totals.paid,
      remaining: totals.planned - totals.paid,
    },
    incomeTotals: {
      expected: incomeExpectedTotal,
      received: incomeReceived,
      pending: incomeExpectedTotal - incomeReceived,
    },
    balance,
    bankTotals,
    expenses,
    incomes,
    banks: banks.map((b) => ({ id: b.id, name: b.name })),
    pendingFromTemplates,
    pendingIncomesFromTemplates,
    monthlySavingsContribution: monthlyContribution
      ? {
          id: monthlyContribution.id,
          amount: Number(monthlyContribution.amount),
          note: monthlyContribution.note,
          occurredOn: monthlyContribution.occurredOn.toISOString().slice(0, 10),
        }
      : null,
  };
}
