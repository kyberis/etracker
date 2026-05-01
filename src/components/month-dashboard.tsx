"use client";

import { format, parse } from "date-fns";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { useBalance } from "@/components/balance-provider";
import { MonthAddIncomeDialog } from "@/components/month/month-add-income-dialog";
import { MonthAddLineDialog } from "@/components/month/month-add-line-dialog";
import { MonthBankTotals } from "@/components/month/month-bank-totals";
import { MonthIncomesChronological } from "@/components/month/month-incomes-chronological";
import { MonthLinesChronological } from "@/components/month/month-lines-chronological";
import { MonthSummary } from "@/components/month/month-summary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { dateLocale } from "@/lib/i18n/format";
import { useLocale, useT, useTx } from "@/lib/i18n/client";
import type {
  MonthIncomeLinePayload,
  MonthLinePayload,
  MonthPageDataWithRecord,
} from "@/lib/month-page-types";
import { isInvestmentCategory } from "@/lib/validators";

type MonthDashboardProps = {
  data: MonthPageDataWithRecord;
};

/**
 * Orchestrator for the month detail page. Heavy UI is split into the focused
 * subcomponents under `src/components/month/`; this file owns the local state
 * and the API calls so the children stay presentational.
 */
export function MonthDashboard({ data }: MonthDashboardProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useT();
  const tx = useTx();
  const balanceCtx = useBalance();
  // Keep the sticky balance header in sync with the month being shown here.
  // We use a ref-like state guard so we only call setMonth on changes.
  const [lastSyncedMonth, setLastSyncedMonth] = useState<string | null>(null);
  if (lastSyncedMonth !== data.month) {
    setLastSyncedMonth(data.month);
    balanceCtx.setMonth(data.month);
  }
  const refreshBalance = () => {
    void balanceCtx.refresh();
  };

  // When the parent server component re-renders with a different `data.month`,
  // reset the local optimistic state. This is the documented React 19 idiom
  // (set state during render, gated on a ref) and replaces the heavy `key=…`
  // prop the page used to pass to remount us on every change.
  const [expenses, setExpenses] = useState(data.expenses);
  const [incomes, setIncomes] = useState<MonthIncomeLinePayload[]>(data.incomes);
  const [carryoverFromPrev, setCarryoverFromPrev] = useState(data.carryoverFromPrev);
  const [carryoverPrompt, setCarryoverPrompt] = useState(data.carryoverPrompt);
  const [carryoverBusy, setCarryoverBusy] = useState<
    null | "addToIncome" | "setAside" | "coverFromSavings" | "carryDebt"
  >(null);
  const [carryoverError, setCarryoverError] = useState<string | null>(null);
  const [dismissedPending, setDismissedPending] = useState(false);
  const [dismissedIncomePending, setDismissedIncomePending] = useState(false);

  // Diálogo "agregar cobro al mes". Igual que el de gastos pero con `received`.
  const [addIncomeName, setAddIncomeName] = useState("");
  const [addIncomeAmount, setAddIncomeAmount] = useState("");
  const [addIncomeBankId, setAddIncomeBankId] = useState("");
  const [addIncomeCategory, setAddIncomeCategory] = useState("OTROS");
  const [addIncomeCurrency, setAddIncomeCurrency] = useState(data.primaryCurrency);
  const [addIncomeFxRateDraft, setAddIncomeFxRateDraft] = useState("");
  const [addIncomeReceived, setAddIncomeReceived] = useState(true);
  const [addIncomeBusy, setAddIncomeBusy] = useState(false);
  const [addIncomeError, setAddIncomeError] = useState<string | null>(null);
  const [addIncomeDialogOpen, setAddIncomeDialogOpen] = useState(false);

  const [mergingIncomePending, setMergingIncomePending] = useState(false);
  const [mergeIncomeError, setMergeIncomeError] = useState<string | null>(null);

  // Aporte mensual a ahorro (informativo). NO afecta el balance del mes;
  // solo declara cuánto el usuario está dedicando a la pila global.
  const [savingsBalance, setSavingsBalance] = useState(data.savings);
  const [monthlyContribution, setMonthlyContribution] = useState(
    data.monthlySavingsContribution,
  );
  const [savingsDialogOpen, setSavingsDialogOpen] = useState(false);
  const [savingsAmountDraft, setSavingsAmountDraft] = useState("");
  const [savingsNoteDraft, setSavingsNoteDraft] = useState("");
  const [savingsBusy, setSavingsBusy] = useState(false);
  const [savingsError, setSavingsError] = useState<string | null>(null);

  const [lastMonth, setLastMonth] = useState(data.month);
  if (lastMonth !== data.month) {
    setLastMonth(data.month);
    setExpenses(data.expenses);
    setIncomes(data.incomes);
    setCarryoverFromPrev(data.carryoverFromPrev);
    setDismissedPending(false);
    setDismissedIncomePending(false);
    setCarryoverPrompt(data.carryoverPrompt);
    setCarryoverError(null);
    setSavingsBalance(data.savings);
    setMonthlyContribution(data.monthlySavingsContribution);
    setSavingsError(null);
  }

  // Add line dialog
  const [addName, setAddName] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addBankId, setAddBankId] = useState(data.banks[0]?.id ?? "");
  const [addCategory, setAddCategory] = useState("OTROS");
  // Foreign-currency support: default to the primary so most flows stay
  // single-input. Switching to another ISO 4217 code triggers an FX preview
  // in the dialog (and an FX lookup server-side on submit).
  const [addCurrency, setAddCurrency] = useState(data.primaryCurrency);
  const [addFxRateDraft, setAddFxRateDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const [mergingPending, setMergingPending] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const totals = useMemo(() => {
    // Totals are always reported in primary currency, so we sum the
    // pre-computed `amountConverted` (NEVER the original `amount`).
    const planned = expenses.reduce((sum, item) => sum + Number(item.amountConverted), 0);
    const paid = expenses
      .filter((item) => item.paid)
      .reduce((sum, item) => sum + Number(item.amountConverted), 0);
    const investment = expenses
      .filter((item) => isInvestmentCategory(item.category))
      .reduce((sum, item) => sum + Number(item.amountConverted), 0);
    return { planned, paid, remaining: planned - paid, investment };
  }, [expenses]);

  // Income totals derivados del estado local: el server provee el initial
  // pero al togglear `received` o agregar un cobro queremos feedback óptico
  // sin esperar al `router.refresh()`. Misma lógica que `totals` para gastos.
  const incomeTotals = useMemo(() => {
    let received = 0;
    let expected = 0;
    for (const line of incomes) {
      const amount = Number(line.amountConverted);
      expected += amount;
      if (line.received) received += amount;
    }
    return { expected, received, pending: expected - received };
  }, [incomes]);

  const income = incomeTotals.received;
  const effectiveIncome = income + carryoverFromPrev;
  const balance = effectiveIncome - totals.planned;

  const expensesByBank = useMemo(() => {
    const grouped = new Map<string, MonthLinePayload[]>();
    for (const expense of expenses) {
      const list = grouped.get(expense.bankId) ?? [];
      list.push(expense);
      grouped.set(expense.bankId, list);
    }
    return grouped;
  }, [expenses]);

  // `data.bankTotals` viene del server con `paid` calculado al render: para
  // que las cards y la suma de pendientes reaccionen al toggle ópticamente,
  // recalculamos `paid` (y por ende el progreso) desde el estado local.
  const liveBankTotals = useMemo(
    () =>
      data.bankTotals.map((bank) => {
        const lines = expensesByBank.get(bank.bankId) ?? [];
        const paid = lines
          .filter((l) => l.paid)
          .reduce((s, l) => s + Number(l.amountConverted), 0);
        return { ...bank, paid };
      }),
    [data.bankTotals, expensesByBank],
  );

  const pendingByBank = useMemo(() => {
    const result: { bankId: string; bankName: string; pending: number }[] = [];
    for (const bank of liveBankTotals) {
      const pending = bank.planned - bank.paid;
      if (pending > 0)
        result.push({ bankId: bank.bankId, bankName: bank.bankName, pending });
    }
    return result;
  }, [liveBankTotals]);

  async function toggleLinePaid(lineId: string, nextPaid: boolean) {
    setExpenses((current) =>
      current.map((item) => (item.id === lineId ? { ...item, paid: nextPaid } : item)),
    );
    const response = await fetch(`/api/month-expense-lines/${lineId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid: nextPaid }),
    });
    if (!response.ok) {
      setExpenses((current) =>
        current.map((item) => (item.id === lineId ? { ...item, paid: !nextPaid } : item)),
      );
      return;
    }
    refreshBalance();
  }

  async function toggleIncomeReceived(lineId: string, nextReceived: boolean) {
    setIncomes((current) =>
      current.map((item) =>
        item.id === lineId ? { ...item, received: nextReceived } : item,
      ),
    );
    const response = await fetch(
      `/api/months/${data.month}/incomes/${lineId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ received: nextReceived }),
      },
    );
    if (!response.ok) {
      setIncomes((current) =>
        current.map((item) =>
          item.id === lineId ? { ...item, received: !nextReceived } : item,
        ),
      );
      return;
    }
    refreshBalance();
  }

  function openAddIncomeDialog() {
    setAddIncomeError(null);
    setAddIncomeName("");
    setAddIncomeAmount("");
    setAddIncomeBankId("");
    setAddIncomeCategory("OTROS");
    setAddIncomeCurrency(data.primaryCurrency);
    setAddIncomeFxRateDraft("");
    setAddIncomeReceived(true);
    setAddIncomeDialogOpen(true);
  }

  async function onAddIncome(e: FormEvent) {
    e.preventDefault();
    setAddIncomeError(null);
    setAddIncomeBusy(true);
    const trimmedFxRate = addIncomeFxRateDraft.trim();
    const res = await fetch(`/api/months/${data.month}/incomes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: addIncomeName,
        amount: Number(addIncomeAmount),
        ...(addIncomeBankId ? { bankId: addIncomeBankId } : {}),
        category: addIncomeCategory,
        currency: addIncomeCurrency || data.primaryCurrency,
        ...(trimmedFxRate ? { fxRate: Number(trimmedFxRate) } : {}),
        received: addIncomeReceived,
      }),
    });
    setAddIncomeBusy(false);
    if (!res.ok) {
      const p = (await res.json()) as { error?: string };
      setAddIncomeError(
        p.error ?? tx({ es: "No se pudo agregar.", en: "Could not add." }),
      );
      return;
    }
    setAddIncomeDialogOpen(false);
    refreshBalance();
    router.refresh();
  }

  async function onMergePendingIncomeTemplates() {
    setMergeIncomeError(null);
    setMergingIncomePending(true);
    // Reusamos el mismo endpoint de gastos: el handler también vuelca las
    // plantillas de ingresos cuando lo invoca el agente, pero acá la UI quiere
    // explícito sobre la pata de income. Hacemos POST a un nuevo endpoint
    // dedicado o reusamos el de gastos? Por ahora: llamamos a ambos.
    const res = await fetch(`/api/months/${data.month}/merge-templates`, {
      method: "POST",
    });
    setMergingIncomePending(false);
    if (!res.ok) {
      const p = (await res.json()) as { error?: string };
      setMergeIncomeError(
        p.error ?? tx({ es: "No se pudo agregar.", en: "Could not add." }),
      );
      return;
    }
    refreshBalance();
    router.refresh();
  }

  async function onAddExpense(e: FormEvent) {
    e.preventDefault();
    if (!addBankId) {
      setAddError(tx({ es: "Elegí un banco.", en: "Choose a bank." }));
      return;
    }
    setAddError(null);
    setAdding(true);
    const trimmedFxRate = addFxRateDraft.trim();
    const res = await fetch(`/api/months/${data.month}/lines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: addName,
        amount: Number(addAmount),
        bankId: addBankId,
        category: addCategory,
        currency: addCurrency || data.primaryCurrency,
        ...(trimmedFxRate ? { fxRate: Number(trimmedFxRate) } : {}),
      }),
    });
    setAdding(false);
    if (!res.ok) {
      const p = (await res.json()) as { error?: string };
      setAddError(p.error ?? tx({ es: "No se pudo agregar.", en: "Could not add." }));
      return;
    }
    setAddName("");
    setAddAmount("");
    setAddCategory("OTROS");
    setAddCurrency(data.primaryCurrency);
    setAddFxRateDraft("");
    setAddDialogOpen(false);
    refreshBalance();
    router.refresh();
  }


  async function onCarryoverDecision(
    mode: "addToIncome" | "setAside" | "coverFromSavings" | "carryDebt",
  ) {
    setCarryoverError(null);
    setCarryoverBusy(mode);
    const promptAmount = carryoverPrompt?.amount ?? 0;
    const res = await fetch(`/api/months/${data.month}/carryover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    setCarryoverBusy(null);
    if (!res.ok) {
      const p = (await res.json()) as { error?: string };
      setCarryoverError(p.error ?? tx({ es: "No se pudo guardar la decisión.", en: "Could not save your choice." }));
      return;
    }
    const payload = (await res.json().catch(() => ({}))) as {
      remainingDebt?: number | null;
    };
    setCarryoverPrompt(null);
    if (mode === "addToIncome") {
      setCarryoverFromPrev((prev) => prev + promptAmount);
    } else if (mode === "carryDebt") {
      setCarryoverFromPrev((prev) => prev - promptAmount);
    } else if (mode === "coverFromSavings") {
      const remaining = payload.remainingDebt ?? 0;
      setCarryoverFromPrev((prev) => prev - remaining);
    }
    refreshBalance();
    router.refresh();
  }

  function openSavingsDialog() {
    setSavingsError(null);
    setSavingsAmountDraft(
      monthlyContribution ? String(monthlyContribution.amount) : "",
    );
    setSavingsNoteDraft(monthlyContribution?.note ?? "");
    setSavingsDialogOpen(true);
  }

  async function onSubmitSavingsContribution(e: FormEvent) {
    e.preventDefault();
    const parsed = Number(savingsAmountDraft);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setSavingsError(tx({ es: "Monto inválido.", en: "Invalid amount." }));
      return;
    }
    setSavingsBusy(true);
    setSavingsError(null);
    const res = await fetch(
      `/api/months/${data.month}/savings-contribution`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parsed,
          note: savingsNoteDraft.trim() || undefined,
        }),
      },
    );
    setSavingsBusy(false);
    if (!res.ok) {
      const p = (await res.json().catch(() => ({}))) as { error?: string };
      setSavingsError(
        p.error ?? tx({ es: "No se pudo guardar.", en: "Could not save." }),
      );
      return;
    }
    const payload = (await res.json()) as {
      balance: number;
      movement: { id: string; amount: number; note: string | null; occurredOn: string };
    };
    setSavingsBalance(payload.balance);
    setMonthlyContribution({
      id: payload.movement.id,
      amount: payload.movement.amount,
      note: payload.movement.note,
      occurredOn: payload.movement.occurredOn,
    });
    setSavingsDialogOpen(false);
  }

  async function onRemoveSavingsContribution() {
    if (
      !window.confirm(
        tx({ es: "¿Quitar el aporte de este mes?", en: "Remove this month's contribution?" }),
      )
    ) {
      return;
    }
    setSavingsBusy(true);
    setSavingsError(null);
    const res = await fetch(
      `/api/months/${data.month}/savings-contribution`,
      { method: "DELETE" },
    );
    setSavingsBusy(false);
    if (!res.ok) {
      const p = (await res.json().catch(() => ({}))) as { error?: string };
      setSavingsError(
        p.error ?? tx({ es: "No se pudo quitar.", en: "Could not remove." }),
      );
      return;
    }
    const payload = (await res.json()) as { balance: number };
    setSavingsBalance(payload.balance);
    setMonthlyContribution(null);
  }

  async function onMergePendingTemplates() {
    setMergeError(null);
    setMergingPending(true);
    const res = await fetch(`/api/months/${data.month}/merge-templates`, { method: "POST" });
    setMergingPending(false);
    if (!res.ok) {
      const p = (await res.json()) as { error?: string };
      setMergeError(p.error ?? tx({ es: "No se pudo agregar.", en: "Could not add." }));
      return;
    }
    refreshBalance();
    router.refresh();
  }

  const showPendingBanner =
    data.pendingFromTemplates.length > 0 && !dismissedPending;

  return (
    <div className="space-y-6 pb-20 sm:pb-6">
      {carryoverPrompt ? (
        carryoverPrompt.type === "leftover" ? (
          <Card className="border-good/40 bg-lime/15">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t.month.carryoverTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                {t.month.carryoverBody(
                  formatCurrency(carryoverPrompt.amount, data.primaryCurrency, locale),
                  format(parse(carryoverPrompt.prevMonth, "yyyy-MM", new Date()), "MMMM yyyy", {
                    locale: dateLocale(locale),
                  }),
                )}
              </p>
              {carryoverError ? (
                <p className="text-destructive text-sm">{carryoverError}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void onCarryoverDecision("addToIncome")}
                  disabled={carryoverBusy !== null}
                >
                  {carryoverBusy === "addToIncome"
                    ? tx({ es: "Sumando…", en: "Adding…" })
                    : t.month.carryoverAdd}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void onCarryoverDecision("setAside")}
                  disabled={carryoverBusy !== null}
                >
                  {carryoverBusy === "setAside"
                    ? tx({ es: "Guardando…", en: "Saving…" })
                    : t.month.carryoverAside}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-bad/40 bg-hotpink/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t.month.deficitTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                {t.month.deficitBody(
                  formatCurrency(carryoverPrompt.amount, data.primaryCurrency, locale),
                  format(parse(carryoverPrompt.prevMonth, "yyyy-MM", new Date()), "MMMM yyyy", {
                    locale: dateLocale(locale),
                  }),
                  formatCurrency(carryoverPrompt.savings, data.primaryCurrency, locale),
                )}
              </p>
              {carryoverError ? (
                <p className="text-destructive text-sm">{carryoverError}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void onCarryoverDecision("coverFromSavings")}
                  disabled={carryoverBusy !== null || carryoverPrompt.savings <= 0}
                >
                  {carryoverBusy === "coverFromSavings"
                    ? tx({ es: "Cubriendo…", en: "Covering…" })
                    : t.month.deficitCover}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void onCarryoverDecision("carryDebt")}
                  disabled={carryoverBusy !== null}
                >
                  {carryoverBusy === "carryDebt"
                    ? tx({ es: "Pasando…", en: "Carrying…" })
                    : t.month.deficitCarry}
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      ) : null}

      {showPendingBanner ? (
        <Card className="border-warn/40 bg-peach/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {tx({
                es: "Gastos nuevos en definiciones",
                en: "New expenses in templates",
              })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              {tx({
                es:
                  data.pendingFromTemplates.length === 1
                    ? `Hay un gasto que aplica a este mes y todavía no está en el mes. Revisalo y agregalo si querés que figure con el resto.`
                    : `Hay ${data.pendingFromTemplates.length} gastos que aplican a este mes y todavía no están en el mes. Revisalos y agregalos si querés que figuren con el resto.`,
                en:
                  data.pendingFromTemplates.length === 1
                    ? `There is one expense that applies to this month but is not in the month yet. Review it and add it if you want it with the rest.`
                    : `There are ${data.pendingFromTemplates.length} expenses that apply to this month but are not in the month yet. Review and add them if you want them listed.`,
              })}
            </p>
            <ul className="text-muted-foreground list-inside list-disc text-xs">
              {data.pendingFromTemplates.map((p) => (
                <li key={p.templateId}>
                  {p.name}{" "}
                  <span className="text-bad tabular-nums">
                    {formatCurrency(Number(p.amount), data.primaryCurrency, locale)}
                  </span>{" "}
                  · {p.bankName}
                </li>
              ))}
            </ul>
            {mergeError ? <p className="text-destructive text-sm">{mergeError}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void onMergePendingTemplates()}
                disabled={mergingPending}
              >
                {mergingPending
                  ? tx({ es: "Agregando…", en: "Adding…" })
                  : tx({ es: "Agregar al mes", en: "Add to month" })}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDismissedPending(true)}
                disabled={mergingPending}
              >
                {tx({ es: "Ahora no", en: "Not now" })}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {data.pendingIncomesFromTemplates.length > 0 && !dismissedIncomePending ? (
        <Card className="border-good/40 bg-lime/15">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {tx({
                es: "Cobros nuevos en plantillas",
                en: "New income in templates",
              })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              {tx({
                es:
                  data.pendingIncomesFromTemplates.length === 1
                    ? `Hay un ingreso recurrente que aplica a este mes y todavía no está cargado. Sumalo si querés que figure con el resto.`
                    : `Hay ${data.pendingIncomesFromTemplates.length} ingresos que aplican a este mes y todavía no están cargados. Sumalos si querés que figuren con el resto.`,
                en:
                  data.pendingIncomesFromTemplates.length === 1
                    ? `There is one recurring income that applies to this month but is not loaded yet. Add it if you want it listed.`
                    : `There are ${data.pendingIncomesFromTemplates.length} incomes that apply to this month but are not loaded yet. Add them if you want them listed.`,
              })}
            </p>
            <ul className="text-muted-foreground list-inside list-disc text-xs">
              {data.pendingIncomesFromTemplates.map((p) => (
                <li key={p.templateId}>
                  {p.name}{" "}
                  <span className="text-good tabular-nums">
                    {formatCurrency(Number(p.amount), data.primaryCurrency, locale)}
                  </span>
                  {p.bankName ? <> · {p.bankName}</> : null}
                </li>
              ))}
            </ul>
            {mergeIncomeError ? (
              <p className="text-destructive text-sm">{mergeIncomeError}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void onMergePendingIncomeTemplates()}
                disabled={mergingIncomePending}
              >
                {mergingIncomePending
                  ? tx({ es: "Agregando…", en: "Adding…" })
                  : tx({ es: "Agregar al mes", en: "Add to month" })}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDismissedIncomePending(true)}
                disabled={mergingIncomePending}
              >
                {tx({ es: "Ahora no", en: "Not now" })}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {data.isCurrentMonth ? (
        <MonthAddIncomeDialog
          open={addIncomeDialogOpen}
          onOpenChange={setAddIncomeDialogOpen}
          banks={data.banks}
          name={addIncomeName}
          amount={addIncomeAmount}
          bankId={addIncomeBankId}
          category={addIncomeCategory}
          currency={addIncomeCurrency}
          fxRateDraft={addIncomeFxRateDraft}
          received={addIncomeReceived}
          primaryCurrency={data.primaryCurrency}
          adding={addIncomeBusy}
          error={addIncomeError}
          onChangeName={setAddIncomeName}
          onChangeAmount={setAddIncomeAmount}
          onChangeBankId={setAddIncomeBankId}
          onChangeCategory={setAddIncomeCategory}
          onChangeCurrency={setAddIncomeCurrency}
          onChangeFxRateDraft={setAddIncomeFxRateDraft}
          onChangeReceived={setAddIncomeReceived}
          onSubmit={onAddIncome}
        />
      ) : null}

      {data.isCurrentMonth && data.banks.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {tx({
            es: "Creá al menos un banco para agregar gastos a este mes.",
            en: "Create at least one bank to add expenses to this month.",
          })}
        </p>
      ) : null}

      {data.isCurrentMonth && data.banks.length > 0 ? (
        <>
          <MonthAddLineDialog
            open={addDialogOpen}
            onOpenChange={setAddDialogOpen}
            banks={data.banks}
            name={addName}
            amount={addAmount}
            bankId={addBankId}
            category={addCategory}
            currency={addCurrency}
            fxRateDraft={addFxRateDraft}
            primaryCurrency={data.primaryCurrency}
            adding={adding}
            error={addError}
            onChangeName={setAddName}
            onChangeAmount={setAddAmount}
            onChangeBankId={setAddBankId}
            onChangeCategory={setAddCategory}
            onChangeCurrency={setAddCurrency}
            onChangeFxRateDraft={setAddFxRateDraft}
            onSubmit={onAddExpense}
          />
          <Button
            type="button"
            onClick={() => {
              setAddError(null);
              setAddDialogOpen(true);
            }}
            className="gradient-lime text-ink fixed right-4 bottom-4 z-30 size-14 rounded-full shadow-[0_18px_40px_-16px_oklch(0.74_0.18_156/0.55)] sm:right-6 sm:bottom-6"
            size="icon"
            aria-label={tx({ es: "Nuevo gasto en este mes", en: "New expense this month" })}
          >
            <Plus className="size-7" />
          </Button>
        </>
      ) : null}

      <MonthSummary
        income={income}
        incomeExpected={incomeTotals.expected}
        incomePending={incomeTotals.pending}
        carryoverFromPrev={carryoverFromPrev}
        savings={savingsBalance}
        totals={totals}
        balance={balance}
        pendingByBank={pendingByBank}
        currency={data.primaryCurrency}
        onAddIncome={data.isCurrentMonth ? openAddIncomeDialog : undefined}
      />

      <Card className="border-lilac/40 bg-lilac/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t.month.savingsCardTitle}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="space-y-1">
            {monthlyContribution ? (
              <>
                <p className="text-lilac num text-lg">
                  {formatCurrency(monthlyContribution.amount, data.primaryCurrency, locale)}
                </p>
                {monthlyContribution.note ? (
                  <p className="text-muted-foreground text-xs">
                    {monthlyContribution.note}
                  </p>
                ) : null}
                <p className="text-muted-foreground text-xs">
                  {tx({
                    es: `Pila total: ${formatCurrency(savingsBalance, data.primaryCurrency, locale)}`,
                    en: `Total pile: ${formatCurrency(savingsBalance, data.primaryCurrency, locale)}`,
                  })}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">
                {t.month.savingsCardEmpty}
                <span className="text-muted-foreground ml-1">
                  {tx({
                    es: `Pila total: ${formatCurrency(savingsBalance, data.primaryCurrency, locale)}`,
                    en: `Total pile: ${formatCurrency(savingsBalance, data.primaryCurrency, locale)}`,
                  })}
                </span>
              </p>
            )}
            {savingsError ? (
              <p className="text-destructive text-xs">{savingsError}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={openSavingsDialog}
              disabled={savingsBusy}
            >
              {monthlyContribution
                ? t.month.savingsEditBtn
                : t.month.savingsAddBtn}
            </Button>
            {monthlyContribution ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => void onRemoveSavingsContribution()}
                disabled={savingsBusy}
              >
                {t.month.savingsRemoveBtn}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={savingsDialogOpen}
        onOpenChange={(open) => (open ? setSavingsDialogOpen(true) : setSavingsDialogOpen(false))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.month.savingsContributionDialogTitle}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSubmitSavingsContribution}>
            <p className="text-muted-foreground text-xs">
              {t.month.savingsContributionHint}
            </p>
            <div className="space-y-2">
              <Label htmlFor="month-savings-amount">
                {tx({ es: "Monto", en: "Amount" })} ({data.primaryCurrency})
              </Label>
              <Input
                id="month-savings-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={savingsAmountDraft}
                onChange={(e) => setSavingsAmountDraft(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="month-savings-note">
                {tx({ es: "Nota (opcional)", en: "Note (optional)" })}
              </Label>
              <Input
                id="month-savings-note"
                type="text"
                value={savingsNoteDraft}
                onChange={(e) => setSavingsNoteDraft(e.target.value)}
                maxLength={500}
              />
            </div>
            {savingsError ? (
              <p className="text-destructive text-sm">{savingsError}</p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSavingsDialogOpen(false)}
                disabled={savingsBusy}
              >
                {tx({ es: "Cancelar", en: "Cancel" })}
              </Button>
              <Button type="submit" disabled={savingsBusy}>
                {savingsBusy
                  ? tx({ es: "Guardando…", en: "Saving…" })
                  : tx({ es: "Guardar", en: "Save" })}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <MonthIncomesChronological
        incomes={incomes}
        primaryCurrency={data.primaryCurrency}
        onToggleReceived={toggleIncomeReceived}
        editable={data.isCurrentMonth}
      />

      {data.incomeHistory.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {tx({
                es: "Ingreso recibido en otros meses",
                en: "Received income in other months",
              })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-2">
              {data.incomeHistory.map((entry) => (
                <div
                  key={entry.month}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <span className="text-sm">
                    {format(parse(entry.month, "yyyy-MM", new Date()), "MMMM yyyy", {
                      locale: dateLocale(locale),
                    })}
                  </span>
                  <span className="text-good font-bold">
                    {formatCurrency(entry.amount, data.primaryCurrency, locale)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <MonthBankTotals
        bankTotals={liveBankTotals}
        primaryCurrency={data.primaryCurrency}
      />

      <MonthLinesChronological
        expenses={expenses}
        primaryCurrency={data.primaryCurrency}
        onTogglePaid={toggleLinePaid}
      />
    </div>
  );
}
