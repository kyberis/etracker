"use client";

import { FormEvent, useMemo, useState } from "react";

import { formatCurrency } from "@/lib/format";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type Bank = { id: string; name: string };
type Expense = {
  id: string;
  name: string;
  amount: string;
  bankId: string;
  bank: { id: string; name: string };
  isRecurring: boolean;
  startMonth: string;
  endMonth: string | null;
};

const currentMonth = new Date().toISOString().slice(0, 7);

type ExpensesManagerProps = {
  initialBanks: Bank[];
  initialExpenses: Expense[];
};

export function ExpensesManager({ initialBanks, initialExpenses }: ExpensesManagerProps) {
  const [banks, setBanks] = useState<Bank[]>(initialBanks);
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("0");
  const [bankId, setBankId] = useState(initialBanks[0]?.id ?? "");
  const [isRecurring, setIsRecurring] = useState(true);
  const [startMonth, setStartMonth] = useState(currentMonth);
  const [endMonth, setEndMonth] = useState("");

  const [search, setSearch] = useState("");
  const [bankFilter, setBankFilter] = useState("all");
  const [recurringFilter, setRecurringFilter] = useState("all");

  async function loadData() {
    const [banksResponse, expensesResponse] = await Promise.all([
      fetch("/api/banks"),
      fetch("/api/expenses"),
    ]);
    const banksData = (await banksResponse.json()) as { banks: Bank[] };
    const expensesData = (await expensesResponse.json()) as { expenses: Expense[] };
    setBanks(banksData.banks ?? []);
    setExpenses(expensesData.expenses ?? []);
    if (!bankId && banksData.banks?.[0]) {
      setBankId(banksData.banks[0].id);
    }
  }

  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      if (search && !expense.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (bankFilter !== "all" && expense.bankId !== bankFilter) return false;
      if (recurringFilter === "recurring" && !expense.isRecurring) return false;
      if (recurringFilter === "oneoff" && expense.isRecurring) return false;
      return true;
    });
  }, [bankFilter, expenses, recurringFilter, search]);

  const selectedBankName = useMemo(
    () => banks.find((bank) => bank.id === bankId)?.name ?? "",
    [bankId, banks],
  );

  const selectedFilterBankName = useMemo(() => {
    if (bankFilter === "all") return "All banks";
    return banks.find((bank) => bank.id === bankFilter)?.name ?? "All banks";
  }, [bankFilter, banks]);

  async function createExpense(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        amount: Number(amount),
        bankId,
        isRecurring,
        startMonth,
        endMonth: isRecurring && endMonth ? endMonth : undefined,
      }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? "Unable to create expense.");
      return;
    }

    setName("");
    setAmount("0");
    setIsRecurring(true);
    setStartMonth(currentMonth);
    setEndMonth("");
    await loadData();
  }

  async function editExpense(expense: Expense) {
    const newName = window.prompt("Expense name", expense.name);
    if (!newName) return;
    const newAmount = window.prompt("Amount", String(expense.amount));
    if (!newAmount) return;

    const response = await fetch(`/api/expenses/${expense.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        amount: Number(newAmount),
        bankId: expense.bankId,
        isRecurring: expense.isRecurring,
        startMonth: expense.startMonth.slice(0, 7),
        endMonth: expense.endMonth ? expense.endMonth.slice(0, 7) : undefined,
      }),
    });

    if (response.ok) {
      await loadData();
    }
  }

  async function removeExpense(expenseId: string) {
    if (!window.confirm("Delete this expense?")) return;
    const response = await fetch(`/api/expenses/${expenseId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      await loadData();
      return;
    }

    const data = (await response.json()) as { error?: string };
    setError(data.error ?? "Unable to delete expense.");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>New expense</CardTitle>
        </CardHeader>
        <CardContent>
          {banks.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Create at least one bank before adding expenses.
            </p>
          ) : (
            <form className="space-y-3" onSubmit={createExpense}>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  placeholder="Expense name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
                <Input
                  placeholder="Amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                />
                <Select value={bankId} onValueChange={(value) => setBankId(value ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select bank">
                      {selectedBankName || undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {banks.map((bank) => (
                      <SelectItem key={bank.id} value={bank.id}>
                        {bank.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="month"
                  value={startMonth}
                  onChange={(event) => setStartMonth(event.target.value)}
                  required
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
                <span className="text-sm">Recurring expense</span>
              </div>
              {isRecurring ? (
                <Input
                  type="month"
                  value={endMonth}
                  onChange={(event) => setEndMonth(event.target.value)}
                  placeholder="Optional end month"
                />
              ) : null}
              <Button type="submit">Create expense</Button>
            </form>
          )}
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Expenses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              placeholder="Search expense"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select value={bankFilter} onValueChange={(value) => setBankFilter(value ?? "all")}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by bank">
                  {selectedFilterBankName}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All banks</SelectItem>
                {banks.map((bank) => (
                  <SelectItem key={bank.id} value={bank.id}>
                    {bank.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={recurringFilter}
              onValueChange={(value) => setRecurringFilter(value ?? "all")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Recurring filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="recurring">Recurring</SelectItem>
                <SelectItem value="oneoff">One-off</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredExpenses.map((expense) => (
            <div
              key={expense.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div>
                <p className="font-medium">{expense.name}</p>
                <p className="text-muted-foreground text-sm">
                  {expense.bank.name} · {formatCurrency(Number(expense.amount))} ·{" "}
                  {expense.isRecurring ? "Recurring" : "One-off"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => editExpense(expense)}>
                  Edit
                </Button>
                <Button size="sm" variant="destructive" onClick={() => removeExpense(expense.id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
          {filteredExpenses.length === 0 ? (
            <p className="text-muted-foreground text-sm">No expenses found.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
