"use client";

import { FormEvent, useMemo, useState } from "react";

import { formatCurrency } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/client";
import { expenseCategoryOptions, isInvestmentCategory } from "@/lib/validators";

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
  category: string;
};

const currentMonth = new Date().toISOString().slice(0, 7);

type ExpensesManagerProps = {
  initialBanks: Bank[];
  initialExpenses: Expense[];
  /** ISO 4217 primary currency. Templates always live in primary currency. */
  primaryCurrency: string;
};

export function ExpensesManager({
  initialBanks,
  initialExpenses,
  primaryCurrency,
}: ExpensesManagerProps) {
  const t = useT();
  const locale = useLocale();
  const allBanksLabel = locale === "en" ? "All banks" : "Todos los bancos";
  const allTypesLabel = locale === "en" ? "All types" : "Todos los tipos";
  const recurringLabel = locale === "en" ? "Recurring" : "Recurrente";
  const oneOffLabel = locale === "en" ? "One-off" : "Puntual";
  const noExpensesLabel = locale === "en" ? "No expenses found." : "No se encontraron plantillas.";
  const filterByBankPlaceholder =
    locale === "en" ? "Filter by bank" : "Filtrar por banco";
  const recurringFilterPlaceholder =
    locale === "en" ? "Recurring filter" : "Filtro recurrente";
  const investmentBadge = locale === "en" ? "investment" : "inversión";
  const noBanksWarning =
    locale === "en"
      ? "Create at least one bank before adding expenses."
      : "Creá al menos un banco antes de agregar plantillas.";
  const newExpenseTitle = locale === "en" ? "New expense template" : "Nueva plantilla";
  const expensesTitle = locale === "en" ? "Templates" : "Plantillas";
  const searchPlaceholder = locale === "en" ? "Search template" : "Buscar plantilla";
  const selectBankPlaceholder = locale === "en" ? "Select bank" : "Elegí un banco";
  const optionalEndPlaceholder =
    locale === "en" ? "Optional end month" : "Mes final (opcional)";
  const recurringSwitchLabel =
    locale === "en" ? "Recurring expense" : "Gasto recurrente";

  const [banks, setBanks] = useState<Bank[]>(initialBanks);
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("0");
  const [bankId, setBankId] = useState(initialBanks[0]?.id ?? "");
  const [isRecurring, setIsRecurring] = useState(true);
  const [startMonth, setStartMonth] = useState(currentMonth);
  const [endMonth, setEndMonth] = useState("");
  const [category, setCategory] = useState<string>("OTROS");

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
    if (bankFilter === "all") return allBanksLabel;
    return banks.find((bank) => bank.id === bankFilter)?.name ?? allBanksLabel;
  }, [bankFilter, banks, allBanksLabel]);

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
        category,
      }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? t.expenses.saveError);
      return;
    }

    setName("");
    setAmount("0");
    setIsRecurring(true);
    setStartMonth(currentMonth);
    setEndMonth("");
    setCategory("OTROS");
    await loadData();
  }

  async function editExpense(expense: Expense) {
    const newName = window.prompt(t.expenses.name, expense.name);
    if (!newName) return;
    const newAmount = window.prompt(t.expenses.amount, String(expense.amount));
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
        category: expense.category,
      }),
    });

    if (response.ok) {
      await loadData();
    }
  }

  async function removeExpense(expense: Expense) {
    if (!window.confirm(t.expenses.deleteConfirm(expense.name))) return;
    const response = await fetch(`/api/expenses/${expense.id}`, {
      method: "DELETE",
    });

    if (response.ok) {
      await loadData();
      return;
    }

    const data = (await response.json()) as { error?: string };
    setError(data.error ?? t.expenses.deleteError);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{newExpenseTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {banks.length === 0 ? (
            <p className="text-muted-foreground text-sm">{noBanksWarning}</p>
          ) : (
            <form className="space-y-3" onSubmit={createExpense}>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  placeholder={t.expenses.name}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
                <Input
                  placeholder={t.expenses.amount}
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                />
                <Select value={bankId} onValueChange={(value) => setBankId(value ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder={selectBankPlaceholder}>
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
                <Select value={category} onValueChange={(v) => setCategory(v ?? "OTROS")}>
                  <SelectTrigger>
                    <SelectValue placeholder={t.expenses.category} />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseCategoryOptions.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c.toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
                <span className="text-sm">{recurringSwitchLabel}</span>
              </div>
              {isRecurring ? (
                <Input
                  type="month"
                  value={endMonth}
                  onChange={(event) => setEndMonth(event.target.value)}
                  placeholder={optionalEndPlaceholder}
                />
              ) : null}
              <Button type="submit">{t.expenses.save}</Button>
            </form>
          )}
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{expensesTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select
              value={bankFilter}
              onValueChange={(value) => setBankFilter(value ?? "all")}
            >
              <SelectTrigger>
                <SelectValue placeholder={filterByBankPlaceholder}>
                  {selectedFilterBankName}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{allBanksLabel}</SelectItem>
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
                <SelectValue placeholder={recurringFilterPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{allTypesLabel}</SelectItem>
                <SelectItem value="recurring">{recurringLabel}</SelectItem>
                <SelectItem value="oneoff">{oneOffLabel}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredExpenses.map((expense) => (
            <div
              key={expense.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div>
                <p className="font-medium">
                  {expense.name}
                  {isInvestmentCategory(expense.category) ? (
                    <span className="bg-lilac/30 text-foreground ml-2 inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-bold">
                      {investmentBadge}
                    </span>
                  ) : null}
                </p>
                <p className="text-muted-foreground text-sm">
                  {expense.bank.name} ·{" "}
                  <span
                    className={
                      isInvestmentCategory(expense.category) ? "text-lilac" : ""
                    }
                  >
                    {formatCurrency(Number(expense.amount), primaryCurrency, locale)}
                  </span>{" "}
                  · {expense.isRecurring ? recurringLabel : oneOffLabel} ·{" "}
                  {expense.category.toLowerCase()}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => editExpense(expense)}>
                  {t.expenses.edit}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => removeExpense(expense)}>
                  {t.expenses.delete}
                </Button>
              </div>
            </div>
          ))}
          {filteredExpenses.length === 0 ? (
            <p className="text-muted-foreground text-sm">{noExpensesLabel}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
