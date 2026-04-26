import { ExpensesManager } from "@/components/expenses-manager";
import { db } from "@/lib/db";
import { formatMonthKey } from "@/lib/months";
import { requireUserId } from "@/lib/session";

export default async function ExpensesPage() {
  const userId = await requireUserId();
  const banks = await db.bank.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const expenses = await db.expense.findMany({
    where: { userId },
    include: { bank: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialExpenses = (expenses as any[]).map((expense) => ({
    id: expense.id as string,
    name: expense.name as string,
    amount: String(expense.amount),
    bankId: expense.bankId as string,
    bank: expense.bank as { id: string; name: string },
    isRecurring: expense.isRecurring as boolean,
    startMonth: formatMonthKey(expense.startMonth as Date),
    endMonth: expense.endMonth ? formatMonthKey(expense.endMonth as Date) : null,
    category: expense.category as string,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Expenses</h1>
      <ExpensesManager initialBanks={banks} initialExpenses={initialExpenses} />
    </div>
  );
}
