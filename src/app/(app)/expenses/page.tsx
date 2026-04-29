import { ExpensesManager } from "@/components/expenses-manager";
import { PageContainer } from "@/components/page-container";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { formatMonthKey } from "@/lib/months";
import { requireUserId } from "@/lib/session";

export default async function ExpensesPage() {
  const [userId, t] = await Promise.all([requireUserId(), getT()]);
  const [user, banks, expenses] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { primaryCurrency: true } }),
    db.bank.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.expense.findMany({
      where: { userId },
      include: { bank: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const primaryCurrency = user?.primaryCurrency ?? "USD";

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
    <PageContainer className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">{t.expenses.pageTitle}</h1>
        <p className="text-muted-foreground text-sm">{t.expenses.pageDescription}</p>
      </div>
      <ExpensesManager
        initialBanks={banks}
        initialExpenses={initialExpenses}
        primaryCurrency={primaryCurrency}
      />
    </PageContainer>
  );
}
