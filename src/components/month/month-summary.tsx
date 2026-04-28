"use client";

import { TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type PendingByBank = { bankId: string; bankName: string; pending: number };

type Props = {
  income: number;
  incomeDraft: string;
  onIncomeDraftChange: (value: string) => void;
  onSaveIncome: () => void | Promise<void>;
  savingIncome: boolean;
  incomeError: string | null;
  /** Amount carried over from the previous month (already part of the saldo). */
  carryoverFromPrev: number;
  /** Cumulative savings pile across all "set aside" decisions. */
  savings: number;
  totals: { planned: number; paid: number; remaining: number; investment: number };
  balance: number;
  pendingByBank: PendingByBank[];
  /** Primary currency for income/totals/balance — defaults to the user's. */
  currency: string;
};

export function MonthSummary({
  income,
  incomeDraft,
  onIncomeDraftChange,
  onSaveIncome,
  savingIncome,
  incomeError,
  carryoverFromPrev,
  savings,
  totals,
  balance,
  pendingByBank,
  currency,
}: Props) {
  const fmt = (value: number) => formatCurrency(value, currency);
  const effectiveIncome = income + carryoverFromPrev;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-sm">Ingreso</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-good num text-xl">{fmt(effectiveIncome)}</div>
          {carryoverFromPrev > 0 ? (
            <p className="text-muted-foreground text-xs">
              incluye {fmt(carryoverFromPrev)} del mes anterior
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={incomeDraft}
              onChange={(event) => onIncomeDraftChange(event.target.value)}
              className="h-8"
            />
            <button
              type="button"
              onClick={() => void onSaveIncome()}
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
        <CardContent title="Total de gastos planificados (pagados y no pagados)">
          <p className="num text-bad text-xl">{fmt(totals.planned)}</p>
          {totals.investment > 0 ? (
            <p className="text-cleo-violet mt-1 flex items-center gap-1 text-xs">
              <TrendingUp className="size-3" />
              {fmt(totals.investment)} inversión
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-sm">Pagado</CardTitle>
        </CardHeader>
        <CardContent className="text-foreground num text-xl">
          {fmt(totals.paid)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-sm">Pendiente</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-foreground num text-xl">{fmt(totals.remaining)}</p>
          {pendingByBank.length > 0 ? (
            <div className="mt-2 space-y-0.5">
              {pendingByBank.map((b) => (
                <p
                  key={b.bankId}
                  className="text-muted-foreground flex items-center justify-between text-xs"
                >
                  <span className="truncate">{b.bankName}</span>
                  <span className="text-warn ml-2 shrink-0 font-bold tabular-nums">
                    {fmt(b.pending)}
                  </span>
                </p>
              ))}
            </div>
          ) : (
            <p className="text-good mt-1 text-xs">✓ Todo pagado</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-sm">Saldo</CardTitle>
        </CardHeader>
        <CardContent
          className={cn(
            "num text-xl",
            balance >= 0 ? "text-good" : "text-bad",
          )}
          title="Ingreso (incluye carryover) − gastos planificados"
        >
          {fmt(balance)}
        </CardContent>
      </Card>

      {savings > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm">Ahorros</CardTitle>
          </CardHeader>
          <CardContent
            className="text-cleo-violet num text-xl"
            title="Pila acumulada cuando elegiste 'dejar aparte' al cierre de un mes."
          >
            {fmt(savings)}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
