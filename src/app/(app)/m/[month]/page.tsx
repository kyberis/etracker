import { format } from "date-fns";
import { notFound } from "next/navigation";

import { MonthDashboard } from "@/components/month-dashboard";
import { MonthPicker } from "@/components/month-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { expenseAppliesToMonth, formatMonthKey, parseMonthKey } from "@/lib/months";
import { getMonthlyIncomeModel } from "@/lib/monthly-income";
import { requireUserId } from "@/lib/session";

type PageProps = {
  params: Promise<{ month: string }>;
};

export default async function MonthPage({ params }: PageProps) {
  const { month } = await params;
  if (!/^\d{4}-\d{2}$/.test(month)) {
    notFound();
  }
  let monthStart: Date;
  try {
    monthStart = parseMonthKey(month);
  } catch {
    notFound();
    return null;
  }

  const userId = await requireUserId();
  const monthlyIncomeModel = getMonthlyIncomeModel();

  const [user, monthIncome, incomeHistory, banks, expenses] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { monthlyIncome: true },
    }),
    monthlyIncomeModel
      ? monthlyIncomeModel.findUnique({
          where: {
            userId_month: {
              userId,
              month: monthStart,
            },
          },
          select: { amount: true },
        })
      : Promise.resolve(null),
    monthlyIncomeModel
      ? monthlyIncomeModel.findMany({
          where: { userId },
          orderBy: { month: "desc" },
          take: 12,
          select: { month: true, amount: true },
        })
      : Promise.resolve([]),
    db.bank.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    }),
    db.expense.findMany({
      where: { userId },
      include: {
        bank: true,
        payments: {
          where: { month: monthStart },
          select: { id: true },
        },
      },
      orderBy: [{ name: "asc" }],
    }),
  ]);

  const resolvedExpenses = expenses
    .filter((expense) => expenseAppliesToMonth(expense, monthStart))
    .map((expense) => ({
      id: expense.id,
      name: expense.name,
      amount: expense.amount.toString(),
      bankId: expense.bankId,
      bankName: expense.bank.name,
      paid: expense.payments.length > 0,
    }));

  const payload = {
    month: format(monthStart, "yyyy-MM"),
    income: Number(monthIncome?.amount ?? user?.monthlyIncome ?? 0),
    defaultIncome: Number(user?.monthlyIncome ?? 0),
    incomeHistory: incomeHistory.map((entry) => ({
      month: formatMonthKey(entry.month),
      amount: Number(entry.amount),
    })),
    totals: { planned: 0, paid: 0, remaining: 0 },
    bankTotals: banks.map((bank) => ({
      bankId: bank.id,
      bankName: bank.name,
      color: bank.color,
    })),
    expenses: resolvedExpenses,
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{format(monthStart, "MMMM yyyy")}</CardTitle>
          <MonthPicker month={month} />
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Check all planned expenses for this month and mark them as paid.
        </CardContent>
      </Card>
      <MonthDashboard data={payload} />
    </div>
  );
}
