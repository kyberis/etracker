"use client";

import { format, parse } from "date-fns";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import type { MonthPageDataWithRecord, MonthLinePayload } from "@/lib/month-page-types";
import { formatCurrency } from "@/lib/format";
import type { ImportableTransaction } from "@/lib/revolut/types";
import { expenseCategoryOptions, expenseCategorySchema, isInvestmentCategory } from "@/lib/validators";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ChevronDown, PlusIcon, RefreshCw, TrendingUp } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type MonthDashboardProps = {
  data: MonthPageDataWithRecord;
};

export function MonthDashboard({ data }: MonthDashboardProps) {
  const router = useRouter();
  const [expenses, setExpenses] = useState(data.expenses);
  const [income, setIncome] = useState(data.income);
  const [incomeDraft, setIncomeDraft] = useState(String(data.income));
  const [savingIncome, setSavingIncome] = useState(false);
  const [incomeError, setIncomeError] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addBankId, setAddBankId] = useState(data.banks[0]?.id ?? "");
  const [addCategory, setAddCategory] = useState("OTROS");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [dismissedPending, setDismissedPending] = useState(false);
  const [mergingPending, setMergingPending] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  /** `true` = colapsada (líneas ocultas). Sin clave = expandida. */
  const [bankCollapsed, setBankCollapsed] = useState<Record<string, boolean>>({});
  const [revolutSyncing, setRevolutSyncing] = useState(false);
  const [revolutError, setRevolutError] = useState<string | null>(null);
  const [revolutFeedback, setRevolutFeedback] = useState<string | null>(null);
  const [revolutDialogOpen, setRevolutDialogOpen] = useState(false);
  const [revolutImportable, setRevolutImportable] = useState<ImportableTransaction[]>([]);
  const [revolutRowBusy, setRevolutRowBusy] = useState<string | null>(null);

  const totals = useMemo(() => {
    const planned = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
    const paid = expenses
      .filter((item) => item.paid)
      .reduce((sum, item) => sum + Number(item.amount), 0);
    const investment = expenses
      .filter((item) => isInvestmentCategory(item.category))
      .reduce((sum, item) => sum + Number(item.amount), 0);
    return {
      planned,
      paid,
      remaining: planned - paid,
      investment,
    };
  }, [expenses]);

  const balance = income - totals.planned;

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
        .reduce((s, l) => s + Number(l.amount), 0);
      if (pending > 0) result.push({ bankId: bank.bankId, bankName: bank.bankName, pending });
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
    }
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
    const res = await fetch(`/api/months/${data.month}/lines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: addName,
        amount: Number(addAmount),
        bankId: addBankId,
        category: addCategory,
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
    setAddDialogOpen(false);
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
      const res = await fetch(`/api/months/${data.month}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tx.description.slice(0, 120),
          amount,
          bankId,
          category,
        }),
      });
      if (!res.ok) {
        const p = (await res.json()) as { error?: string };
        setRevolutError(p.error ?? "No se pudo importar.");
        return;
      }
      setRevolutImportable((cur) => cur.filter((t) => t.transactionId !== tx.transactionId));
      router.refresh();
    } finally {
      setRevolutRowBusy(null);
    }
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
    router.refresh();
  }

  const showPendingBanner =
    data.pendingFromTemplates.length > 0 && !dismissedPending;

  function isBankExpanded(bankId: string) {
    return bankCollapsed[bankId] !== true;
  }

  return (
    <div className="space-y-6 pb-20 sm:pb-6">
      {showPendingBanner ? (
        <Card className="border-amber-500/40 bg-amber-500/[0.07]">
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
                  <span className="text-red-600 tabular-nums dark:text-red-500">
                    {formatCurrency(Number(p.amount))}
                  </span>{" "}
                  · {p.bankName}
                </li>
              ))}
            </ul>
            {mergeError ? <p className="text-destructive text-sm">{mergeError}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void onMergePendingTemplates()} disabled={mergingPending}>
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
        <Card className="border-violet-500/30 bg-violet-500/[0.06]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revolut</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Sincronizá movimientos del mes para marcar gastos como pagados e importar lo que falte.
              Con instrucciones en Ajustes, se filtran y categorizan movimientos con el asistente
              (requiere OpenAI).
            </p>
            {!data.revolut.defaultImportBankId ? (
              <p className="text-amber-700 dark:text-amber-400">
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

      <Dialog open={revolutDialogOpen} onOpenChange={setRevolutDialogOpen}>
        <DialogContent
          className="max-h-[min(90vh,640px)] overflow-y-auto sm:max-w-lg"
          showCloseButton
        >
          <DialogHeader>
            <DialogTitle>Importar desde Revolut</DialogTitle>
            <DialogDescription>
              Movimientos del mes sin coincidencia con tus gastos planificados. Si definiste
              instrucciones en Ajustes, el asistente puede haber filtrado transferencias u otros
              movimientos y sugerir categoría. Importá como gasto del mes o ignorá para no volver a
              verlos al sincronizar.
            </DialogDescription>
          </DialogHeader>
          {revolutImportable.length === 0 ? (
            <p className="text-muted-foreground text-sm">No quedan movimientos pendientes.</p>
          ) : (
            <ul className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
              {revolutImportable.map((tx) => (
                <li
                  key={tx.transactionId}
                  className="space-y-2 rounded-md border p-3 text-sm"
                >
                  <p className="font-medium leading-snug">{tx.description}</p>
                  <p className="text-muted-foreground text-xs">
                    {tx.bookingDate ? `${tx.bookingDate} · ` : null}
                    <span className="font-mono tabular-nums text-red-600 dark:text-red-400">
                      {formatCurrency(Math.abs(Number(tx.amount)))}
                    </span>
                    {tx.currency ? ` ${tx.currency}` : null}
                  </p>
                  {tx.suggestedCategory ? (
                    <p className="text-muted-foreground text-xs">
                      Categoría sugerida:{" "}
                      <span className="text-foreground font-medium">{tx.suggestedCategory}</span>
                      {tx.assistantNote ? ` — ${tx.assistantNote}` : null}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        !data.revolut.defaultImportBankId || revolutRowBusy === tx.transactionId
                      }
                      onClick={() => void onRevolutImport(tx)}
                    >
                      {revolutRowBusy === tx.transactionId ? "Importando…" : "Importar"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={revolutRowBusy === tx.transactionId}
                      onClick={() => void onRevolutIgnore([tx.transactionId])}
                    >
                      Ignorar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {revolutImportable.length > 0 ? (
            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() =>
                  void onRevolutIgnore(revolutImportable.map((t) => t.transactionId))
                }
              >
                Ignorar todas las restantes
              </Button>
              <Button type="button" variant="outline" onClick={() => setRevolutDialogOpen(false)}>
                Cerrar
              </Button>
            </DialogFooter>
          ) : (
            <DialogFooter>
              <Button type="button" onClick={() => setRevolutDialogOpen(false)}>
                Cerrar
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {data.isCurrentMonth && data.banks.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Creá al menos un banco para agregar gastos a este mes.
        </p>
      ) : null}

      {data.isCurrentMonth && data.banks.length > 0 ? (
        <>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogContent
              className="max-h-[min(90vh,640px)] overflow-y-auto sm:max-w-md"
              showCloseButton
            >
              <DialogHeader>
                <DialogTitle>Nuevo gasto (este mes)</DialogTitle>
                <DialogDescription>
                  Solo aplica al mes en curso. No modifica las definiciones.
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-3" onSubmit={onAddExpense}>
                <div className="space-y-1">
                  <label className="text-muted-foreground text-xs" htmlFor="add-name">
                    Nombre
                  </label>
                  <Input
                    id="add-name"
                    value={addName}
                    onChange={(ev) => setAddName(ev.target.value)}
                    required
                    placeholder="Ej. Regalo, extra…"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-muted-foreground text-xs" htmlFor="add-amount">
                    Monto
                  </label>
                  <Input
                    id="add-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={addAmount}
                    onChange={(ev) => setAddAmount(ev.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground text-xs">Banco</span>
                  <Select value={addBankId} onValueChange={(v) => setAddBankId(v ?? "")} required>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {addBankId
                          ? (data.banks.find((b) => b.id === addBankId)?.name ?? "Banco")
                          : "Elegir banco"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {data.banks.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground text-xs">Categoría</span>
                  <Select value={addCategory} onValueChange={(v) => setAddCategory(v ?? "OTROS")}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {addCategory ? addCategory.toLowerCase() : "Categoría"}
                      </SelectValue>
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
                {addError ? <p className="text-destructive text-sm">{addError}</p> : null}
                <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAddDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={adding}>
                    {adding ? "Agregando…" : "Agregar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Button
            type="button"
            onClick={() => {
              setAddError(null);
              setAddDialogOpen(true);
            }}
            className="bg-primary text-primary-foreground hover:bg-primary/90 fixed right-4 bottom-4 z-50 size-14 rounded-full shadow-lg sm:right-6 sm:bottom-6"
            size="icon"
            aria-label="Nuevo gasto en este mes"
          >
            <PlusIcon className="size-7" />
          </Button>
        </>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm">Ingreso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-emerald-600 text-xl font-semibold dark:text-emerald-500">
              {formatCurrency(income)}
            </div>
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
                {savingIncome ? "…" : "Guardar"}
              </button>
            </div>
            {incomeError ? <p className="text-destructive text-sm">{incomeError}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm">Gastos (plan.)</CardTitle>
          </CardHeader>
          <CardContent
            title="Total de gastos planificados (pagados y no pagados)"
          >
            <p className={cn("text-xl font-semibold", "text-red-600 dark:text-red-500")}>
              {formatCurrency(totals.planned)}
            </p>
            {totals.investment > 0 ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400">
                <TrendingUp className="size-3" />
                {formatCurrency(totals.investment)} inversión
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm">Pagado</CardTitle>
          </CardHeader>
          <CardContent className="text-foreground text-xl font-semibold">
            {formatCurrency(totals.paid)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm">Pendiente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground text-xl font-semibold">{formatCurrency(totals.remaining)}</p>
            {pendingByBank.length > 0 ? (
              <div className="mt-2 space-y-0.5">
                {pendingByBank.map((b) => (
                  <p key={b.bankId} className="text-muted-foreground flex items-center justify-between text-xs">
                    <span className="truncate">{b.bankName}</span>
                    <span className="text-amber-600 dark:text-amber-400 ml-2 shrink-0 tabular-nums font-medium">
                      {formatCurrency(b.pending)}
                    </span>
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-emerald-600 dark:text-emerald-400 mt-1 text-xs">✓ Todo pagado</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm">Saldo</CardTitle>
          </CardHeader>
          <CardContent
            className={cn(
              "text-xl font-semibold",
              balance >= 0
                ? "text-emerald-600 dark:text-emerald-500"
                : "text-red-600 dark:text-red-500",
            )}
            title="Ingreso − gastos planificados"
          >
            {formatCurrency(balance)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Ingreso en otros meses (reciente)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-muted-foreground text-sm">
            Ingreso por defecto (meses nuevos):{" "}
            <span className="text-emerald-600 font-medium dark:text-emerald-500">
              {formatCurrency(data.defaultIncome)}
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
                    <span className="text-emerald-600 font-medium dark:text-emerald-500">
                      {formatCurrency(entry.amount)}
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {data.bankTotals.map((bank) => {
          const bankExpenses = expensesByBank.get(bank.bankId) ?? [];
          const bankPlanned = bankExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
          const bankPaid = bankExpenses
            .filter((item) => item.paid)
            .reduce((sum, item) => sum + Number(item.amount), 0);
          const bankPending = bankPlanned - bankPaid;
          if (bankExpenses.length === 0) return null;

          const expanded = isBankExpanded(bank.bankId);

          return (
            <Card
              key={bank.bankId}
              className="flex min-h-0 min-w-0 flex-col overflow-hidden py-0"
            >
              <div className="border-b">
                <button
                  type="button"
                  className="hover:bg-muted/50 flex w-full min-w-0 items-start justify-between gap-2 py-2 pr-2 pl-1.5 text-left"
                  onClick={() =>
                    setBankCollapsed((c) => ({ ...c, [bank.bankId]: c[bank.bankId] !== true }))
                  }
                  aria-expanded={expanded}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-1">
                    <ChevronDown
                      className={cn(
                        "text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform duration-200",
                        expanded ? "rotate-0" : "-rotate-90",
                      )}
                      aria-hidden
                    />
                    <span className="font-heading line-clamp-2 pr-0.5 text-sm leading-tight font-medium">
                      {bank.bankName}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-red-600 dark:text-red-500">
                      {formatCurrency(bankPlanned)}
                    </p>
                    {bankPending > 0 ? (
                      <p className="text-[11px] tabular-nums text-amber-600 dark:text-amber-400">
                        {formatCurrency(bankPending)} pendiente
                      </p>
                    ) : (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                        ✓ Todo pagado
                      </p>
                    )}
                  </div>
                </button>
              </div>
              {expanded ? (
                <CardContent className="flex min-h-0 flex-1 flex-col gap-1 p-2">
                  {bankExpenses.map((expense) => (
                    <label
                      key={expense.id}
                      className="hover:bg-muted/50 flex min-h-[2.5rem] cursor-pointer items-center gap-2 rounded-md border border-transparent px-1.5 py-1"
                    >
                      <Checkbox
                        className="shrink-0"
                        checked={expense.paid}
                        onCheckedChange={(checked) =>
                          toggleLinePaid(expense.id, checked === true)
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium leading-tight">
                          {expense.name}
                          {isInvestmentCategory(expense.category) ? (
                            <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-indigo-100 px-1.5 py-px text-[10px] font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400">
                              <TrendingUp className="size-2.5" />
                              inversión
                            </span>
                          ) : null}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {expense.category ? `${expense.category.toLowerCase()} · ` : null}
                          <span className={cn(
                            "tabular-nums",
                            isInvestmentCategory(expense.category)
                              ? "text-indigo-600 dark:text-indigo-400"
                              : "text-red-600 dark:text-red-500",
                          )}>
                            {formatCurrency(Number(expense.amount))}
                          </span>
                        </p>
                      </div>
                    </label>
                  ))}
                </CardContent>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
