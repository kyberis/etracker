"use client";

import { format, parse } from "date-fns";
import { Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { useBalance } from "@/components/balance-provider";
import { MonthAddLineDialog } from "@/components/month/month-add-line-dialog";
import { MonthBankTotals } from "@/components/month/month-bank-totals";
import { MonthLinesChronological } from "@/components/month/month-lines-chronological";
import { MonthSummary } from "@/components/month/month-summary";
import { RevolutImportDialog } from "@/components/month/revolut-import-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { dateLocale } from "@/lib/i18n/format";
import { useLocale, useT, useTx } from "@/lib/i18n/client";
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

  async function saveIncomeWithAmount(amount: number) {
    const parsedIncome = Number(amount);
    if (Number.isNaN(parsedIncome) || parsedIncome < 0) {
      setIncomeError(tx({ es: "Ingreso debe ser 0 o positivo.", en: "Income must be zero or positive." }));
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
      setIncomeError(payload.error ?? tx({ es: "No se pudo guardar.", en: "Could not save." }));
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
        setRevolutError(payload.error ?? tx({ es: "No se pudo sincronizar.", en: "Could not sync." }));
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
            ? tx({
                es: `${matched.length} gasto(s) marcado(s) como pagado(s). Revisá importaciones abajo.`,
                en: `${matched.length} expense(s) marked paid. Review imports below.`,
              })
            : tx({
                es: "No hubo coincidencias automáticas. Podés importar o ignorar movimientos.",
                en: "No automatic matches. You can import or ignore transactions.",
              }),
        );
      } else if (matched.length > 0) {
        setRevolutFeedback(
          tx({
            es: `${matched.length} gasto(s) marcado(s) como pagado(s).`,
            en: `${matched.length} expense(s) marked paid.`,
          }),
        );
      } else {
        setRevolutFeedback(
          tx({
            es: "Sincronizado: no hay movimientos nuevos para importar.",
            en: "Synced: no new transactions to import.",
          }),
        );
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
      setRevolutError(p.error ?? tx({ es: "No se pudo ignorar.", en: "Could not ignore." }));
      return;
    }
    const idSet = new Set(ids);
    setRevolutImportable((cur) => cur.filter((t) => !idSet.has(t.transactionId)));
  }

  async function onRevolutImport(importRow: ImportableTransaction) {
    const bankId = data.revolut.defaultImportBankId;
    if (!bankId) {
      setRevolutError(
        tx({
          es: "Elegí un banco de importación en Ajustes → Revolut.",
          en: "Choose an import bank under Settings → Revolut.",
        }),
      );
      return;
    }
    setRevolutRowBusy(importRow.transactionId);
    setRevolutError(null);
    try {
      const amount = Math.abs(Number(importRow.amount));
      if (!Number.isFinite(amount) || amount <= 0) {
        setRevolutError(tx({ es: "Monto inválido en el movimiento.", en: "Invalid amount on this transaction." }));
        return;
      }
      const categoryParsed = expenseCategorySchema.safeParse(importRow.suggestedCategory);
      const category = categoryParsed.success ? categoryParsed.data : "OTROS";
      // Pass through the transaction currency so the server applies an FX
      // lookup when it differs from the user's primary; if the bank reports
      // the line in primary currency we just skip the conversion.
      const res = await fetch(`/api/months/${data.month}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: importRow.description.slice(0, 120),
          amount,
          bankId,
          category,
          ...(importRow.currency ? { currency: importRow.currency } : {}),
        }),
      });
      if (!res.ok) {
        const p = (await res.json()) as { error?: string };
        setRevolutError(p.error ?? tx({ es: "No se pudo importar.", en: "Could not import." }));
        return;
      }
      setRevolutImportable((cur) =>
        cur.filter((t) => t.transactionId !== importRow.transactionId),
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
      setCarryoverError(p.error ?? tx({ es: "No se pudo guardar la decisión.", en: "Could not save your choice." }));
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

      {data.isCurrentMonth && data.revolut.linked ? (
        <Card className="border-lilac/40 bg-lilac/15">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revolut</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {tx({
                es: "Sincronizá movimientos del mes para marcar gastos como pagados e importar lo que falte. Con instrucciones en Ajustes, se filtran y categorizan movimientos con el asistente (requiere OpenAI).",
                en: "Sync this month’s transactions to mark expenses paid and import what’s missing. With instructions in Settings, movements are filtered and categorized by the assistant (requires OpenAI).",
              })}
            </p>
            {!data.revolut.defaultImportBankId ? (
              <p className="text-warn">
                {tx({
                  es: (
                    <>
                      Elegí un banco local para importar en{" "}
                      <Link href="/settings" className="underline">
                        Ajustes → Revolut
                      </Link>
                      .
                    </>
                  ),
                  en: (
                    <>
                      Choose a local bank for imports under{" "}
                      <Link href="/settings" className="underline">
                        Settings → Revolut
                      </Link>
                      .
                    </>
                  ),
                })}
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
                {revolutSyncing
                  ? tx({ es: "Sincronizando…", en: "Syncing…" })
                  : tx({ es: "Sincronizar Revolut", en: "Sync Revolut" })}
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
          <CardTitle className="text-sm">
            {tx({
              es: "Ingreso en otros meses (reciente)",
              en: "Income in other months (recent)",
            })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-muted-foreground text-sm">
            {tx({
              es: "Ingreso por defecto (meses nuevos):",
              en: "Default income (new months):",
            })}{" "}
            <span className="text-good font-bold">
              {formatCurrency(data.defaultIncome, data.primaryCurrency, locale)}
            </span>
          </div>
          {data.incomeHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {tx({ es: "Nada más aún.", en: "Nothing else yet." })}
            </p>
          ) : (
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
                  <div className="flex items-center gap-2">
                    <span className="text-good font-bold">
                      {formatCurrency(entry.amount, data.primaryCurrency, locale)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIncomeDraft(String(entry.amount));
                        void saveIncomeWithAmount(entry.amount);
                      }}
                      className="border-input hover:bg-muted h-7 rounded-md border px-2 text-xs"
                    >
                      {tx({ es: "Usar en este mes", en: "Use for this month" })}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
