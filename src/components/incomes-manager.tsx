"use client";

import { FormEvent, useMemo, useState } from "react";

import { formatCurrency } from "@/lib/format";
import { pick, useLocale, useT } from "@/lib/i18n/client";
import { incomeCategoryOptions } from "@/lib/validators";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyPicker } from "@/components/ui/currency-picker";
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
type Income = {
  id: string;
  name: string;
  amount: string;
  currency: string;
  bankId: string | null;
  bank: { id: string; name: string } | null;
  isRecurring: boolean;
  startMonth: string;
  endMonth: string | null;
  category: string;
};

const currentMonth = new Date().toISOString().slice(0, 7);

type IncomesManagerProps = {
  initialBanks: Bank[];
  initialIncomes: Income[];
  /** ISO 4217 primary currency. Default cuando la plantilla no especifica otra. */
  primaryCurrency: string;
};

const NO_BANK_VALUE = "__none__";

/**
 * Manager de plantillas de ingreso. Espejo de `ExpensesManager` con dos
 * diferencias clave: (1) `bankId` es opcional y la UI permite "sin banco";
 * (2) cada plantilla tiene su propia `currency` (puede no ser la principal,
 * típico para un freelance que cobra en USD para un usuario con primary EUR).
 */
export function IncomesManager({
  initialBanks,
  initialIncomes,
  primaryCurrency,
}: IncomesManagerProps) {
  const t = useT();
  const locale = useLocale();
  const allBanksLabel = pick(locale, { es: "Todos los bancos", en: "All banks" });
  const allTypesLabel = pick(locale, { es: "Todos los tipos", en: "All types" });
  const recurringLabel = pick(locale, { es: "Recurrente", en: "Recurring" });
  const oneOffLabel = pick(locale, { es: "Puntual", en: "One-off" });
  const noIncomesLabel = pick(locale, {
    es: "No se encontraron plantillas.",
    en: "No incomes found.",
  });
  const noBankLabel = pick(locale, { es: "Sin banco", en: "No bank" });
  const filterByBankPlaceholder = pick(locale, {
    es: "Filtrar por banco",
    en: "Filter by bank",
  });
  const recurringFilterPlaceholder = pick(locale, {
    es: "Filtro recurrente",
    en: "Recurring filter",
  });
  const newIncomeTitle = pick(locale, {
    es: "Nueva plantilla de ingreso",
    en: "New income template",
  });
  const incomesTitle = pick(locale, { es: "Plantillas", en: "Templates" });
  const searchPlaceholder = pick(locale, {
    es: "Buscar plantilla",
    en: "Search template",
  });
  const optionalEndPlaceholder = pick(locale, {
    es: "Mes final (opcional)",
    en: "Optional end month",
  });
  const recurringSwitchLabel = pick(locale, {
    es: "Ingreso recurrente",
    en: "Recurring income",
  });
  const namePlaceholder = pick(locale, { es: "Sueldo, alquiler, freelance…", en: "Salary, rent, freelance…" });

  const [banks] = useState<Bank[]>(initialBanks);
  const [incomes, setIncomes] = useState<Income[]>(initialIncomes);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("0");
  const [currency, setCurrency] = useState(primaryCurrency);
  const [bankId, setBankId] = useState<string>(""); // "" = sin banco
  const [isRecurring, setIsRecurring] = useState(true);
  const [startMonth, setStartMonth] = useState(currentMonth);
  const [endMonth, setEndMonth] = useState("");
  const [category, setCategory] = useState<string>("OTROS");

  const [search, setSearch] = useState("");
  const [bankFilter, setBankFilter] = useState("all");
  const [recurringFilter, setRecurringFilter] = useState("all");

  async function loadData() {
    const response = await fetch("/api/incomes");
    const data = (await response.json()) as { incomes: Income[] };
    setIncomes(data.incomes ?? []);
  }

  const filtered = useMemo(() => {
    return incomes.filter((income) => {
      if (search && !income.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (bankFilter !== "all") {
        if (bankFilter === NO_BANK_VALUE) {
          if (income.bankId) return false;
        } else if (income.bankId !== bankFilter) {
          return false;
        }
      }
      if (recurringFilter === "recurring" && !income.isRecurring) return false;
      if (recurringFilter === "oneoff" && income.isRecurring) return false;
      return true;
    });
  }, [bankFilter, incomes, recurringFilter, search]);

  const selectedFilterBankName = useMemo(() => {
    if (bankFilter === "all") return allBanksLabel;
    if (bankFilter === NO_BANK_VALUE) return noBankLabel;
    return banks.find((bank) => bank.id === bankFilter)?.name ?? allBanksLabel;
  }, [bankFilter, banks, allBanksLabel, noBankLabel]);

  async function createIncome(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/incomes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        amount: Number(amount),
        currency,
        ...(bankId ? { bankId } : {}),
        isRecurring,
        startMonth,
        endMonth: isRecurring && endMonth ? endMonth : undefined,
        category,
      }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? t.incomes.saveError);
      return;
    }

    setName("");
    setAmount("0");
    setIsRecurring(true);
    setStartMonth(currentMonth);
    setEndMonth("");
    setCategory("OTROS");
    setBankId("");
    setCurrency(primaryCurrency);
    await loadData();
  }

  async function editIncome(income: Income) {
    const newName = window.prompt(t.incomes.name, income.name);
    if (!newName) return;
    const newAmount = window.prompt(t.incomes.amount, String(income.amount));
    if (!newAmount) return;

    const response = await fetch(`/api/incomes/${income.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        amount: Number(newAmount),
        currency: income.currency,
        ...(income.bankId ? { bankId: income.bankId } : {}),
        isRecurring: income.isRecurring,
        startMonth: income.startMonth.slice(0, 7),
        endMonth: income.endMonth ? income.endMonth.slice(0, 7) : undefined,
        category: income.category,
      }),
    });

    if (response.ok) {
      await loadData();
    }
  }

  async function removeIncome(income: Income) {
    if (!window.confirm(t.incomes.deleteConfirm(income.name))) return;
    const response = await fetch(`/api/incomes/${income.id}`, {
      method: "DELETE",
    });

    if (response.ok) {
      await loadData();
      return;
    }

    const data = (await response.json()) as { error?: string };
    setError(data.error ?? t.incomes.deleteError);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{newIncomeTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={createIncome}>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                placeholder={namePlaceholder}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
              <Input
                placeholder={t.incomes.amount}
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
              <CurrencyPicker value={currency} onChange={setCurrency} />
              <Select
                value={bankId || NO_BANK_VALUE}
                onValueChange={(value) =>
                  setBankId(value === NO_BANK_VALUE ? "" : (value ?? ""))
                }
              >
                <SelectTrigger>
                  <SelectValue>
                    {bankId
                      ? (banks.find((b) => b.id === bankId)?.name ?? noBankLabel)
                      : noBankLabel}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_BANK_VALUE}>{noBankLabel}</SelectItem>
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
                  <SelectValue placeholder={t.incomes.category} />
                </SelectTrigger>
                <SelectContent>
                  {incomeCategoryOptions.map((c) => (
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
            <Button type="submit">{t.incomes.save}</Button>
          </form>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{incomesTitle}</CardTitle>
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
                <SelectItem value={NO_BANK_VALUE}>{noBankLabel}</SelectItem>
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

          {filtered.map((income) => (
            <div
              key={income.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div>
                <p className="font-medium">{income.name}</p>
                <p className="text-muted-foreground text-sm">
                  {income.bank?.name ?? noBankLabel} ·{" "}
                  <span className="text-good">
                    {formatCurrency(Number(income.amount), income.currency, locale)}
                  </span>{" "}
                  · {income.isRecurring ? recurringLabel : oneOffLabel} ·{" "}
                  {income.category.toLowerCase()}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => editIncome(income)}>
                  {t.incomes.edit}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => removeIncome(income)}>
                  {t.incomes.delete}
                </Button>
              </div>
            </div>
          ))}
          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm">{noIncomesLabel}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
