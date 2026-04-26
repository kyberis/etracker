import { listPendingTemplateExpensesForMonth } from "@/lib/month-bucket";
import { formatMonthKey, isCurrentMonthKey, parseMonthKey, toMonthStart } from "@/lib/months";

import { db } from "./db";
import type { MonthLinePayload, MonthPageData } from "./month-page-types";

export async function loadMonthPageData(userId: string, monthKey: string): Promise<MonthPageData> {
  const monthStart = parseMonthKey(monthKey);
  const monthForQuery = toMonthStart(monthStart);

  const [user, monthRecord, banks, incomeHistory] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { monthlyIncome: true },
    }),
    db.monthRecord.findFirst({
      where: { userId, month: monthForQuery },
      include: {
        lines: { include: { bank: true } },
      },
    }),
    db.bank.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    }),
    db.monthRecord.findMany({
      where: { userId },
      orderBy: { month: "desc" },
      take: 12,
      select: { month: true, income: true },
    }),
  ]);

  const defaultIncome = user ? Number(user.monthlyIncome) : 0;
  const history = incomeHistory.map((e) => ({
    month: formatMonthKey(e.month),
    amount: Number(e.income),
  }));

  const isCurrentMonth = isCurrentMonthKey(monthKey);

  if (!monthRecord) {
    return {
      month: monthKey,
      hasRecord: false as const,
      defaultIncome,
      incomeHistory: history,
    };
  }

  const income = Number(monthRecord.income);
  const expenses: MonthLinePayload[] = monthRecord.lines.map((line) => ({
    id: line.id,
    name: line.name,
    amount: line.amount.toString(),
    bankId: line.bankId,
    bankName: line.bank.name,
    paid: line.paid,
    category: line.category,
  }));

  const bankTotals = banks.map((bank) => {
    const entries = expenses.filter((e) => e.bankId === bank.id);
    const planned = entries.reduce((s, e) => s + Number(e.amount), 0);
    const paid = entries.filter((e) => e.paid).reduce((s, e) => s + Number(e.amount), 0);
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

  const balance = income - totals.planned;

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
    income,
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
  };
}
