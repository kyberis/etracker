"use client";

import { Plus, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { useLocale, useT, useTx } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type PendingByBank = { bankId: string; bankName: string; pending: number };

type Props = {
  /** Total recibido este mes (sum líneas con `received=true`). */
  income: number;
  /** Total previsto este mes (sum todas las líneas). */
  incomeExpected: number;
  /** Cuántos cobros previstos quedan sin recibir (para CTA "previsto"). */
  incomePending: number;
  /** Amount carried over from the previous month (already part of the saldo). */
  carryoverFromPrev: number;
  /** Cumulative savings pile across all "set aside" decisions. */
  savings: number;
  totals: { planned: number; paid: number; remaining: number; investment: number };
  balance: number;
  pendingByBank: PendingByBank[];
  /** Primary currency for income/totals/balance — defaults to the user's. */
  currency: string;
  /** Abrir el diálogo "Agregar cobro al mes". Solo se pasa en el mes en curso. */
  onAddIncome?: () => void;
};

export function MonthSummary({
  income,
  incomeExpected,
  incomePending,
  carryoverFromPrev,
  savings,
  totals,
  balance,
  pendingByBank,
  currency,
  onAddIncome,
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
        <CardContent className="space-y-1">
          <div
            className="text-good num text-xl"
            title={tx({
              es: "Suma de los cobros confirmados este mes (incluye carryover si lo hay)",
              en: "Sum of received income this month (includes carryover when present)",
            })}
          >
            {fmt(effectiveIncome)}
          </div>
          {carryoverFromPrev > 0 ? (
            <p className="text-muted-foreground text-xs">
              {tx({
                es: `incluye ${fmt(carryoverFromPrev)} del mes anterior`,
                en: `includes ${fmt(carryoverFromPrev)} from last month`,
              })}
            </p>
          ) : null}
          {incomePending > 0 ? (
            <p className="text-warn text-xs">
              {tx({
                es: `+ ${fmt(incomePending)} previsto sin confirmar`,
                en: `+ ${fmt(incomePending)} expected, not yet received`,
              })}
            </p>
          ) : null}
          {incomeExpected === 0 && onAddIncome ? (
            <p className="text-muted-foreground text-xs">
              {tx({
                es: "Sin ingresos cargados todavía.",
                en: "No income recorded yet.",
              })}
            </p>
          ) : null}
          {onAddIncome ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-good hover:text-good -ml-2 h-7 px-2 text-xs"
              onClick={onAddIncome}
            >
              <Plus className="mr-1 size-3" />
              {tx({ es: "Agregar cobro", en: "Add income" })}
            </Button>
          ) : null}
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
            es: "Ingreso recibido (incluye carryover) − gastos planificados",
            en: "Received income (includes carryover) − planned expenses",
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
