"use client";

import { TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import { useLocale, useT, useTx } from "@/lib/i18n/client";
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
  const locale = useLocale();
  const t = useT();
  const tx = useTx();
  const fmt = (value: number) => formatCurrency(value, currency, locale);
  const effectiveIncome = income + carryoverFromPrev;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-sm">{t.month.summaryIncome}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-good num text-xl">{fmt(effectiveIncome)}</div>
          {carryoverFromPrev > 0 ? (
            <p className="text-muted-foreground text-xs">
              {tx({
                es: `incluye ${fmt(carryoverFromPrev)} del mes anterior`,
                en: `includes ${fmt(carryoverFromPrev)} from last month`,
              })}
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
              {savingIncome ? "…" : t.common.save}
            </button>
          </div>
          {incomeError ? <p className="text-destructive text-sm">{incomeError}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-sm">
            {tx({ es: "Gastos (plan.)", en: "Expenses (planned)" })}
          </CardTitle>
        </CardHeader>
        <CardContent
          title={tx({
            es: "Total de gastos planificados (pagados y no pagados)",
            en: "Total planned expenses (paid and unpaid)",
          })}
        >
          <p className="num text-bad text-xl">{fmt(totals.planned)}</p>
          {totals.investment > 0 ? (
            <p className="text-lilac mt-1 flex items-center gap-1 text-xs">
              <TrendingUp className="size-3" />
              {tx({
                es: `${fmt(totals.investment)} inversión`,
                en: `${fmt(totals.investment)} investment`,
              })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-sm">{t.month.summaryPaid}</CardTitle>
        </CardHeader>
        <CardContent className="text-foreground num text-xl">
          {fmt(totals.paid)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-sm">{t.month.summaryRemaining}</CardTitle>
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
            <p className="text-good mt-1 text-xs">
              {tx({ es: "✓ Todo pagado", en: "✓ All paid" })}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-sm">{t.month.summaryBalance}</CardTitle>
        </CardHeader>
        <CardContent
          className={cn(
            "num text-xl",
            balance >= 0 ? "text-good" : "text-bad",
          )}
          title={tx({
            es: "Ingreso (incluye carryover) − gastos planificados",
            en: "Income (includes carryover) − planned expenses",
          })}
        >
          {fmt(balance)}
        </CardContent>
      </Card>

      {savings > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm">
              {tx({ es: "Ahorros", en: "Savings" })}
            </CardTitle>
          </CardHeader>
          <CardContent
            className="text-lilac num text-xl"
            title={tx({
              es: "Pila acumulada cuando elegiste 'dejar aparte' al cierre de un mes.",
              en: "Running total when you chose “set aside” at the end of a month.",
            })}
          >
            {fmt(savings)}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
