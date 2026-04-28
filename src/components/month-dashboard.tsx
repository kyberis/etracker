"use client";

import { format, parse } from "date-fns";
import { Plus, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { useBalance } from "@/components/balance-provider";
import { MonthAddLineDialog } from "@/components/month/month-add-line-dialog";
import { MonthLinesByBank } from "@/components/month/month-lines-by-bank";
import { MonthSummary } from "@/components/month/month-summary";
import { RevolutImportDialog } from "@/components/month/revolut-import-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { MonthLinePayload, MonthPageDataWithRecord } from "@/lib/month-page-types";
import type { ImportableTransaction } from "@/lib/revolut/types";
import { expenseCategorySchema, isInvestmentCategory } from "@/lib/validators";

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
  const [income, setIncome] = useState(data.income);
  const [carryoverFromPrev, setCarryoverFromPrev] = useState(data.carryoverFromPrev);
  const [carryoverPrompt, setCarryoverPrompt] = useState(data.carryoverPrompt);
  const [carryoverBusy, setCarryoverBusy] = useState<null | "addToIncome" | "setAside">(null);
  const [carryoverError, setCarryoverError] = useState<string | null>(null);
  const [incomeDraft, setIncomeDraft] = useState(String(data.income));
  const [dismissedPending, setDismissedPending] = useState(false);
  const [lastMonth, setLastMonth] = useState(data.month);
  if (lastMonth !== data.month) {
    setLastMonth(data.month);
    setExpenses(data.expenses);
    setIncome(data.income);
    setCarryoverFromPrev(data.carryoverFromPrev);
    setIncomeDraft(String(data.income));
    setDismissedPending(false);
    setCarryoverPrompt(data.carryoverPrompt);
    setCarryoverError(null);
  }

  const [savingIncome, setSavingIncome] = useState(false);
  const [incomeError, setIncomeError] = useState<string | null>(null);

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

  /** `true` = colapsada (líneas ocultas). Sin clave = expandida. */
  const [bankCollapsed, setBankCollapsed] = useState<Record<string, boolean>>({});

  // Revolut import dialog
  const [revolutSyncing, setRevolutSyncing] = useState(false);
  const [revolutError, setRevolutError] = useState<string | null>(null);
  const [revolutFeedback, setRevolutFeedback] = useState<string | null>(null);
  const [revolutDialogOpen, setRevolutDialogOpen] = useState(false);
  const [revolutImportable, setRevolutImportable] = useState<ImportableTransaction[]>([]);
  const [revolutRowBusy, setRevolutRowBusy] = useState<string | null>(null);

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

  const pendingByBank = useMemo(() => {
    const result: { bankId: string; bankName: string; pending: number }[] = [];
    for (const bank of data.bankTotals) {
      const lines = expensesByBank.get(bank.bankId) ?? [];
      const pending = lines
        .filter((l) => !l.paid)
        .reduce((s, l) => s + Number(l.amountConverted), 0);
      if (pending > 0)
        result.push({ bankId: bank.bankId, bankName: bank.bankName, pending });
    }
    return result;
  }, [data.bankTotals, expensesByBank]);

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

  async function saveIncomeWithAmount(amount: number) {
    const parsedIncome = Number(amount);
    if (Number.isNaN(parsedIncome) || parsedIncome < 0) {
      setIncomeError("Ingreso debe ser 0 o positivo.");
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
      setIncomeError(payload.error ?? "No se pudo guardar.");
      return;
    }
    setIncome(parsedIncome);
    setIncomeDraft(String(parsedIncome));
    refreshBalance();
  }

  async function saveIncome() {
    await saveIncomeWithAmount(Number(incomeDraft));
  }

  async function onAddExpense(e: FormEvent) {
    e.preventDefault();
    if (!addBankId) {
      setAddError("Elegí un banco.");
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
      setAddError(p.error ?? "No se pudo agregar.");
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

  async function onRevolutSync() {
    setRevolutSyncing(true);
    setRevolutError(null);
    setRevolutFeedback(null);
    try {
      const res = await fetch("/api/revolut/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: data.month }),
      });
      const payload = (await res.json()) as {
        error?: string;
        matched?: { lineId: string }[];
        importable?: ImportableTransaction[];
      };
      if (!res.ok) {
        setRevolutError(payload.error ?? "No se pudo sincronizar.");
        return;
      }
      const matched = payload.matched ?? [];
      if (matched.length > 0) {
        const ids = new Set(matched.map((m) => m.lineId));
        setExpenses((cur) => cur.map((e) => (ids.has(e.id) ? { ...e, paid: true } : e)));
      }
      const importable = payload.importable ?? [];
      setRevolutImportable(importable);
      if (importable.length > 0) {
        setRevolutDialogOpen(true);
        setRevolutFeedback(
          matched.length > 0
            ? `${matched.length} gasto(s) marcado(s) como pagado(s). Revisá importaciones abajo.`
            : "No hubo coincidencias automáticas. Podés importar o ignorar movimientos.",
        );
      } else if (matched.length > 0) {
        setRevolutFeedback(`${matched.length} gasto(s) marcado(s) como pagado(s).`);
      } else {
        setRevolutFeedback("Sincronizado: no hay movimientos nuevos para importar.");
      }
      refreshBalance();
      router.refresh();
    } finally {
      setRevolutSyncing(false);
    }
  }

  async function onRevolutIgnore(ids: string[]) {
    if (ids.length === 0) return;
    const res = await fetch("/api/revolut/ignore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionIds: ids }),
    });
    if (!res.ok) {
      const p = (await res.json()) as { error?: string };
      setRevolutError(p.error ?? "No se pudo ignorar.");
      return;
    }
    const idSet = new Set(ids);
    setRevolutImportable((cur) => cur.filter((t) => !idSet.has(t.transactionId)));
  }

  async function onRevolutImport(tx: ImportableTransaction) {
    const bankId = data.revolut.defaultImportBankId;
    if (!bankId) {
      setRevolutError("Elegí un banco de importación en Ajustes → Revolut.");
      return;
    }
    setRevolutRowBusy(tx.transactionId);
    setRevolutError(null);
    try {
      const amount = Math.abs(Number(tx.amount));
      if (!Number.isFinite(amount) || amount <= 0) {
        setRevolutError("Monto inválido en el movimiento.");
        return;
      }
      const categoryParsed = expenseCategorySchema.safeParse(tx.suggestedCategory);
      const category = categoryParsed.success ? categoryParsed.data : "OTROS";
      // Pass through the transaction currency so the server applies an FX
      // lookup when it differs from the user's primary; if the bank reports
      // the line in primary currency we just skip the conversion.
      const res = await fetch(`/api/months/${data.month}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tx.description.slice(0, 120),
          amount,
          bankId,
          category,
          ...(tx.currency ? { currency: tx.currency } : {}),
        }),
      });
      if (!res.ok) {
        const p = (await res.json()) as { error?: string };
        setRevolutError(p.error ?? "No se pudo importar.");
        return;
      }
      setRevolutImportable((cur) =>
        cur.filter((t) => t.transactionId !== tx.transactionId),
      );
      refreshBalance();
      router.refresh();
    } finally {
      setRevolutRowBusy(null);
    }
  }

  async function onCarryoverDecision(mode: "addToIncome" | "setAside") {
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
      setCarryoverError(p.error ?? "No se pudo guardar la decisión.");
      return;
    }
    setCarryoverPrompt(null);
    if (mode === "addToIncome") {
      setCarryoverFromPrev((prev) => prev + promptAmount);
    }
    refreshBalance();
    router.refresh();
  }

  async function onMergePendingTemplates() {
    setMergeError(null);
    setMergingPending(true);
    const res = await fetch(`/api/months/${data.month}/merge-templates`, { method: "POST" });
    setMergingPending(false);
    if (!res.ok) {
      const p = (await res.json()) as { error?: string };
      setMergeError(p.error ?? "No se pudo agregar.");
      return;
    }
    refreshBalance();
    router.refresh();
  }

  function toggleBankCollapsed(bankId: string) {
    setBankCollapsed((c) => ({ ...c, [bankId]: c[bankId] !== true }));
  }

  const showPendingBanner =
    data.pendingFromTemplates.length > 0 && !dismissedPending;

  return (
    <div className="space-y-6 pb-20 sm:pb-6">
      {carryoverPrompt ? (
        <Card className="border-good/40 bg-lime/15">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              ¡Bien ahí! Te sobró plata del mes pasado
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Cerraste{" "}
              <strong className="text-good tabular-nums">
                {formatCurrency(carryoverPrompt.amount, data.primaryCurrency)}
              </strong>{" "}
              sin gastar en{" "}
              {format(parse(carryoverPrompt.prevMonth, "yyyy-MM", new Date()), "MMMM yyyy")}.
              ¿Qué querés hacer con eso?
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
                {carryoverBusy === "addToIncome" ? "Sumando…" : "Sumar al ingreso"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void onCarryoverDecision("setAside")}
                disabled={carryoverBusy !== null}
              >
                {carryoverBusy === "setAside" ? "Guardando…" : "Dejar aparte (ahorros)"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showPendingBanner ? (
        <Card className="border-warn/40 bg-peach/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Gastos nuevos en definiciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Hay{" "}
              <strong>
                {data.pendingFromTemplates.length} gasto
                {data.pendingFromTemplates.length === 1 ? "" : "s"}
              </strong>{" "}
              {data.pendingFromTemplates.length === 1
                ? "que aplica a este mes y todavía no está en el mes. "
                : "que aplican a este mes y todavía no están en el mes. "}
              Revisalos y agregalos si querés que figuren con el resto.
            </p>
            <ul className="text-muted-foreground list-inside list-disc text-xs">
              {data.pendingFromTemplates.map((p) => (
                <li key={p.templateId}>
                  {p.name}{" "}
                  <span className="text-bad tabular-nums">
                    {formatCurrency(Number(p.amount), data.primaryCurrency)}
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
                {mergingPending ? "Agregando…" : "Agregar al mes"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDismissedPending(true)}
                disabled={mergingPending}
              >
                Ahora no
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {data.isCurrentMonth && data.revolut.linked ? (
        <Card className="border-cleo-violet/40 bg-cleo-violet/15">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revolut</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Sincronizá movimientos del mes para marcar gastos como pagados e importar lo que
              falte. Con instrucciones en Ajustes, se filtran y categorizan movimientos con el
              asistente (requiere OpenAI).
            </p>
            {!data.revolut.defaultImportBankId ? (
              <p className="text-warn">
                Elegí un banco local para importar en{" "}
                <a href="/settings" className="underline">
                  Ajustes → Revolut
                </a>
                .
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                className="gap-2"
                disabled={revolutSyncing}
                onClick={() => void onRevolutSync()}
              >
                <RefreshCw className={revolutSyncing ? "size-4 animate-spin" : "size-4"} />
                {revolutSyncing ? "Sincronizando…" : "Sincronizar Revolut"}
              </Button>
            </div>
            {revolutError ? <p className="text-destructive text-sm">{revolutError}</p> : null}
            {revolutFeedback ? (
              <p className="text-muted-foreground text-sm">{revolutFeedback}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <RevolutImportDialog
        open={revolutDialogOpen}
        onOpenChange={setRevolutDialogOpen}
        importable={revolutImportable}
        defaultImportBankId={data.revolut.defaultImportBankId}
        rowBusyId={revolutRowBusy}
        onImport={onRevolutImport}
        onIgnore={onRevolutIgnore}
      />

      {data.isCurrentMonth && data.banks.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Creá al menos un banco para agregar gastos a este mes.
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
            aria-label="Nuevo gasto en este mes"
          >
            <Plus className="size-7" />
          </Button>
        </>
      ) : null}

      <MonthSummary
        income={income}
        incomeDraft={incomeDraft}
        onIncomeDraftChange={setIncomeDraft}
        onSaveIncome={saveIncome}
        savingIncome={savingIncome}
        incomeError={incomeError}
        carryoverFromPrev={carryoverFromPrev}
        savings={data.savings}
        totals={totals}
        balance={balance}
        pendingByBank={pendingByBank}
        currency={data.primaryCurrency}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Ingreso en otros meses (reciente)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-muted-foreground text-sm">
            Ingreso por defecto (meses nuevos):{" "}
            <span className="text-good font-bold">
              {formatCurrency(data.defaultIncome, data.primaryCurrency)}
            </span>
          </div>
          {data.incomeHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nada más aún.</p>
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
                    <span className="text-good font-bold">
                      {formatCurrency(entry.amount, data.primaryCurrency)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIncomeDraft(String(entry.amount));
                        void saveIncomeWithAmount(entry.amount);
                      }}
                      className="border-input hover:bg-muted h-7 rounded-md border px-2 text-xs"
                    >
                      Usar en este mes
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <MonthLinesByBank
        bankTotals={data.bankTotals}
        expensesByBank={expensesByBank}
        bankCollapsed={bankCollapsed}
        onToggleCollapsed={toggleBankCollapsed}
        onTogglePaid={toggleLinePaid}
        primaryCurrency={data.primaryCurrency}
      />
    </div>
  );
}
