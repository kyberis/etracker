"use client";

import { format, parse } from "date-fns";
import { useMemo, useState } from "react";

import { formatCurrency } from "@/lib/format";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

type ExpenseItem = {
  id: string;
  name: string;
  amount: string | number;
  bankId: string;
  bankName: string;
  paid: boolean;
};

type MonthResponse = {
  month: string;
  income: number;
  defaultIncome: number;
  incomeHistory: Array<{ month: string; amount: number }>;
  totals: { planned: number; paid: number; remaining: number };
  bankTotals: Array<{ bankId: string; bankName: string; color?: string | null }>;
  expenses: ExpenseItem[];
};

type MonthDashboardProps = {
  data: MonthResponse;
};

export function MonthDashboard({ data }: MonthDashboardProps) {
  const [expenses, setExpenses] = useState(data.expenses);
  const [income, setIncome] = useState(data.income);
  const [incomeDraft, setIncomeDraft] = useState(String(data.income));
  const [savingIncome, setSavingIncome] = useState(false);
  const [incomeError, setIncomeError] = useState<string | null>(null);

  const totals = useMemo(() => {
    const planned = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
    const paid = expenses
      .filter((item) => item.paid)
      .reduce((sum, item) => sum + Number(item.amount), 0);
    return {
      planned,
      paid,
      remaining: planned - paid,
    };
  }, [expenses]);

  const expensesByBank = useMemo(() => {
    const grouped = new Map<string, ExpenseItem[]>();
    for (const expense of expenses) {
      const list = grouped.get(expense.bankId) ?? [];
      list.push(expense);
      grouped.set(expense.bankId, list);
    }
    return grouped;
  }, [expenses]);

  async function togglePayment(expenseId: string, nextPaid: boolean) {
    setExpenses((current) =>
      current.map((item) => (item.id === expenseId ? { ...item, paid: nextPaid } : item)),
    );

    const response = await fetch(`/api/expenses/${expenseId}/payments`, {
      method: nextPaid ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: data.month }),
    });

    if (!response.ok) {
      setExpenses((current) =>
        current.map((item) => (item.id === expenseId ? { ...item, paid: !nextPaid } : item)),
      );
    }
  }

  async function saveIncomeWithAmount(amount: number) {
    const parsedIncome = Number(amount);
    if (Number.isNaN(parsedIncome) || parsedIncome < 0) {
      setIncomeError("Income must be zero or a positive number.");
      return;
    }

    setSavingIncome(true);
    setIncomeError(null);
    const response = await fetch(`/api/months/${data.month}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: parsedIncome }),
    });

    setSavingIncome(false);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setIncomeError(payload.error ?? "Unable to save income.");
      return;
    }

    setIncome(parsedIncome);
    setIncomeDraft(String(parsedIncome));
  }

  async function saveIncome() {
    await saveIncomeWithAmount(Number(incomeDraft));
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm">Income</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-xl font-semibold">{formatCurrency(income)}</div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={incomeDraft}
                onChange={(event) => setIncomeDraft(event.target.value)}
                className="h-8"
              />
              <button
                type="button"
                onClick={saveIncome}
                disabled={savingIncome}
                className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 rounded-md px-3 text-sm disabled:opacity-50"
              >
                {savingIncome ? "Saving..." : "Save"}
              </button>
            </div>
            {incomeError ? <p className="text-sm text-red-600">{incomeError}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm">Planned</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {formatCurrency(totals.planned)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm">Paid</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{formatCurrency(totals.paid)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm">Remaining</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {formatCurrency(totals.remaining)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Income history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-muted-foreground text-sm">
            Default income (used when month has no override): {formatCurrency(data.defaultIncome)}
          </div>
          {data.incomeHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm">No custom month income yet.</p>
          ) : (
            <div className="space-y-2">
              {data.incomeHistory.map((entry) => (
                <div
                  key={entry.month}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <span className="text-sm">
                    {format(parse(entry.month, "yyyy-MM", new Date()), "MMMM yyyy")}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{formatCurrency(entry.amount)}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIncomeDraft(String(entry.amount));
                        void saveIncomeWithAmount(entry.amount);
                      }}
                      className="border-input hover:bg-muted h-7 rounded-md border px-2 text-xs"
                    >
                      Use for this month
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {data.bankTotals.map((bank) => {
          const bankExpenses = expensesByBank.get(bank.bankId) ?? [];
          const bankPlanned = bankExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
          if (bankExpenses.length === 0) return null;

          return (
            <Card key={bank.bankId}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{bank.bankName}</CardTitle>
                <Badge variant="secondary">{formatCurrency(bankPlanned)}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {bankExpenses.map((expense) => (
                  <label
                    key={expense.id}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div>
                      <p className="font-medium">{expense.name}</p>
                      <p className="text-muted-foreground text-sm">
                        {formatCurrency(Number(expense.amount))}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">Paid</span>
                      <Checkbox
                        checked={expense.paid}
                        onCheckedChange={(checked) => togglePayment(expense.id, checked === true)}
                      />
                    </div>
                  </label>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
