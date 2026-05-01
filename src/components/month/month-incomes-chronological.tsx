"use client";

import { format, isSameDay, isToday, isYesterday } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { formatLineAmount } from "@/lib/format";
import { dateLocale } from "@/lib/i18n/format";
import { useLocale, useT, useTx } from "@/lib/i18n/client";
import type { MonthIncomeLinePayload } from "@/lib/month-page-types";
import { cn } from "@/lib/utils";

import type { Locale } from "@/lib/i18n/locale";

type Props = {
  /** Pre-ordered desc por `createdAt` desde el backend. */
  incomes: MonthIncomeLinePayload[];
  primaryCurrency: string;
  /**
   * Callback al togglear `received`. La línea pasa del estado actual al nuevo.
   * Solo se permite editar el mes en curso; viewer-mode (meses pasados) recibe
   * un no-op.
   */
  onToggleReceived: (lineId: string, nextReceived: boolean) => void;
  /** Permite togglear / mostrar checkboxes interactivos. */
  editable: boolean;
};

function dayLabel(
  date: Date,
  locale: Locale,
  tx: ReturnType<typeof useTx>,
): string {
  if (isToday(date)) return tx({ es: "hoy", en: "today" });
  if (isYesterday(date)) return tx({ es: "ayer", en: "yesterday" });
  return format(date, "d MMM", { locale: dateLocale(locale) });
}

type DayGroup = { key: string; label: string; lines: MonthIncomeLinePayload[] };

function groupByDay(
  incomes: MonthIncomeLinePayload[],
  locale: Locale,
  tx: ReturnType<typeof useTx>,
): DayGroup[] {
  const groups: DayGroup[] = [];
  let current: DayGroup | null = null;
  for (const income of incomes) {
    const created = new Date(income.createdAt);
    if (!current || !isSameDay(new Date(current.lines[0].createdAt), created)) {
      current = {
        key: format(created, "yyyy-MM-dd"),
        label: dayLabel(created, locale, tx),
        lines: [],
      };
      groups.push(current);
    }
    current.lines.push(income);
  }
  return groups;
}

/**
 * Lista cronológica de líneas de ingreso. Espejo de
 * `MonthLinesChronological` con `received` en lugar de `paid` y la convención
 * inversa: una línea **no recibida** se muestra con peso visual (es la
 * "tarea pendiente" del usuario), una recibida se atenúa.
 */
export function MonthIncomesChronological({
  incomes,
  primaryCurrency,
  onToggleReceived,
  editable,
}: Props) {
  const locale = useLocale();
  const t = useT();
  const tx = useTx();
  const groups = groupByDay(incomes, locale, tx);
  const pending = incomes.filter((i) => !i.received).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-0.5">
          <CardTitle className="text-sm">
            {t.month.incomesChronoTitle}
          </CardTitle>
          <p className="text-muted-foreground text-xs">
            {tx({
              es: "cobros del mes · más nuevo primero",
              en: "income this month · newest first",
            })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-[11px] font-medium tabular-nums">
            {incomes.length}{" "}
            {incomes.length === 1
              ? tx({ es: "cobro", en: "income" })
              : tx({ es: "cobros", en: "incomes" })}
          </span>
          {pending > 0 ? (
            <span className="bg-warn/15 text-warn rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums">
              {pending}{" "}
              {tx({ es: "previsto/s", en: "pending" })}
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        {incomes.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            {tx({
              es: "Todavía no hay cobros en este mes.",
              en: "No income in this month yet.",
            })}
          </p>
        ) : (
          <div className="space-y-1">
            {groups.map((group, groupIdx) => (
              <div key={group.key} className={cn(groupIdx > 0 && "pt-3")}>
                <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-[0.18em]">
                  {group.label}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {group.lines.map((income) => (
                    <li key={income.id}>
                      <label
                        className={cn(
                          "hover:bg-muted/50 flex min-h-[2.75rem] cursor-pointer items-center gap-3 rounded-lg border border-transparent px-2 py-2",
                          !income.received && "border-warn/30 bg-warn/5",
                        )}
                      >
                        <Checkbox
                          className="shrink-0"
                          checked={income.received}
                          disabled={!editable}
                          onCheckedChange={(checked) =>
                            editable &&
                            onToggleReceived(income.id, checked === true)
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "flex items-center gap-1.5 truncate text-sm font-medium leading-tight",
                              income.received && "text-muted-foreground",
                            )}
                          >
                            <span className="truncate">{income.name}</span>
                            {!income.received ? (
                              <span className="bg-warn/20 text-warn inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-bold uppercase">
                                {tx({ es: "previsto", en: "expected" })}
                              </span>
                            ) : null}
                          </p>
                          <p className="text-muted-foreground mt-0.5 truncate text-xs">
                            {income.bankName ? (
                              <>
                                <span className="font-medium">
                                  {income.bankName}
                                </span>
                                <span className="mx-1">·</span>
                              </>
                            ) : null}
                            <span>{income.category.toLowerCase()}</span>
                          </p>
                        </div>
                        <p
                          className={cn(
                            "shrink-0 text-sm font-semibold tabular-nums",
                            income.received ? "text-good" : "text-warn",
                          )}
                        >
                          {formatLineAmount(income, primaryCurrency, locale)}
                        </p>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
