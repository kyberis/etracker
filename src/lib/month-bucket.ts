import { type Expense, type ExpenseCategory, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { expenseAppliesToMonth, parseMonthKey, toMonthStart } from "@/lib/months";

type LineInput = {
  templateId: string | null;
  bankId: string;
  name: string;
  amount: Prisma.Decimal;
  category: ExpenseCategory;
  paid: boolean;
};

function linesFromExpenses(
  expenses: Expense[],
  month: Date,
  paidForTemplate: (templateId: string) => boolean,
): LineInput[] {
  return expenses
    .filter((e) => expenseAppliesToMonth(e, month))
    .map((e) => ({
      templateId: e.id,
      bankId: e.bankId,
      name: e.name,
      amount: e.amount,
      category: e.category,
      paid: paidForTemplate(e.id),
    }));
}

/**
 * All expense templates that apply to a calendar month, as create-many payloads.
 * No rows are marked paid.
 */
export async function templateLinesForMonth(userId: string, month: Date) {
  const expenses = await db.expense.findMany({ where: { userId } });
  return linesFromExpenses(expenses, month, () => false);
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

  const lineData = await templateLinesForMonth(userId, month);

  return {
    type: "created" as const,
    record: await db.monthRecord.create({
      data: {
        userId,
        month: start,
        income: user.monthlyIncome,
        lines: {
          create: lineData.map((l) => ({
            templateId: l.templateId,
            bankId: l.bankId,
            name: l.name,
            amount: l.amount,
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
            templateId: l.templateId,
            bankId: l.bankId,
            name: l.name,
            amount: l.amount,
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
