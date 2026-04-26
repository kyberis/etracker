import type { Prisma } from "@prisma/client";

import { ExpensesManager } from "@/components/expenses-manager";
import { db } from "@/lib/db";
import { formatMonthKey } from "@/lib/months";
import { requireUserId } from "@/lib/session";

type ExpenseWithBank = Prisma.ExpenseGetPayload<{
  include: { bank: { select: { id: true; name: true } } };
}>;

export default async function ExpensesPage() {
  const userId = await requireUserId();
  const banks = await db.bank.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const expenses: ExpenseWithBank[] = await db.expense.findMany({
    where: { userId },
    include: { bank: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  const initialExpenses = expenses.map((expense: ExpenseWithBank) => ({
    id: expense.id,
    name: expense.name,
    amount: expense.amount.toString(),
    bankId: expense.bankId,
    bank: expense.bank,
    isRecurring: expense.isRecurring,
    startMonth: formatMonthKey(expense.startMonth),
    endMonth: expense.endMonth ? formatMonthKey(expense.endMonth) : null,
    category: expense.category,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Expenses</h1>
      <ExpensesManager initialBanks={banks} initialExpenses={initialExpenses} />
    </div>
  );
}
