import { getBanksCached } from "@/lib/cache/banks";
import {
  getPrevMonthLeftover,
  listPendingTemplateExpensesForMonth,
} from "@/lib/month-bucket";
import { formatMonthKey, isCurrentMonthKey, parseMonthKey, toMonthStart } from "@/lib/months";

import { db } from "./db";
import type { CarryoverPrompt, MonthLinePayload, MonthPageData } from "./month-page-types";

export async function loadMonthPageData(userId: string, monthKey: string): Promise<MonthPageData> {
  const monthStart = parseMonthKey(monthKey);
  const monthForQuery = toMonthStart(monthStart);

  const [user, monthRecord, banks, incomeHistory, revolutConnection] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { monthlyIncome: true, primaryCurrency: true, savings: true },
    }),
    db.monthRecord.findFirst({
      where: { userId, month: monthForQuery },
      include: {
        lines: { include: { bank: true } },
      },
    }),
    getBanksCached(userId),
    db.monthRecord.findMany({
      where: { userId },
      orderBy: { month: "desc" },
      take: 12,
      select: { month: true, income: true },
    }),
    db.revolutConnection.findUnique({
      where: { userId },
      select: { status: true, accountId: true, defaultImportBankId: true },
    }),
  ]);

  const defaultIncome = user ? Number(user.monthlyIncome) : 0;
  const primaryCurrency = user?.primaryCurrency ?? "USD";
  const savings = user ? Number(user.savings) : 0;
  const history = incomeHistory.map((e) => ({
    month: formatMonthKey(e.month),
    amount: Number(e.income),
  }));

  const isCurrentMonth = isCurrentMonthKey(monthKey);

  const revolutState = {
    linked: Boolean(revolutConnection?.accountId),
    defaultImportBankId: revolutConnection?.defaultImportBankId ?? null,
  };

  if (!monthRecord) {
    return {
      month: monthKey,
      hasRecord: false as const,
      defaultIncome,
      primaryCurrency,
      incomeHistory: history,
    };
  }

  const income = Number(monthRecord.income);
  const carryoverFromPrev = Number(monthRecord.carryoverFromPrev);
  const effectiveIncome = income + carryoverFromPrev;
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
    const leftover = await getPrevMonthLeftover(userId, monthForQuery);
    if (leftover) {
      carryoverPrompt = {
        prevMonth: leftover.prevMonthKey,
        amount: leftover.amount,
      };
    }
  }

  const existingTemplateIds = new Set(
    monthRecord.lines
      .map((l) => l.templateId)
      .filter((id): id is string => Boolean(id)),
  );
  const pendingFromTemplates = await listPendingTemplateExpensesForMonth(
    userId,
    monthKey,
    existingTemplateIds,
  );

  return {
    month: monthKey,
    hasRecord: true as const,
    defaultIncome,
    primaryCurrency,
    income,
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
    balance,
    bankTotals,
    expenses,
    banks: banks.map((b) => ({ id: b.id, name: b.name })),
    pendingFromTemplates,
    revolut: revolutState,
  };
}
