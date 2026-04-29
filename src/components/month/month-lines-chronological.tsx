"use client";

import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { formatLineAmount } from "@/lib/format";
import { dateLocale } from "@/lib/i18n/format";
import { useLocale, useT, useTx } from "@/lib/i18n/client";
import type { MonthLinePayload } from "@/lib/month-page-types";
import { cn } from "@/lib/utils";
import { isInvestmentCategory } from "@/lib/validators";

import type { Locale } from "@/lib/i18n/locale";

type Props = {
  /** Pre-ordered desc por `createdAt` desde el backend. */
  expenses: MonthLinePayload[];
  primaryCurrency: string;
  onTogglePaid: (lineId: string, nextPaid: boolean) => void;
};

/** Etiqueta amigable de un grupo: "hoy", "ayer" o "26 abr". */
function dayLabel(
  date: Date,
  locale: Locale,
  tx: ReturnType<typeof useTx>,
): string {
  if (isToday(date)) return tx({ es: "hoy", en: "today" });
  if (isYesterday(date)) return tx({ es: "ayer", en: "yesterday" });
  return format(date, "d MMM", { locale: dateLocale(locale) });
}

type DayGroup = { key: string; label: string; lines: MonthLinePayload[] };

function groupByDay(
  expenses: MonthLinePayload[],
  locale: Locale,
  tx: ReturnType<typeof useTx>,
): DayGroup[] {
  const groups: DayGroup[] = [];
  let current: DayGroup | null = null;
  for (const expense of expenses) {
    const created = new Date(expense.createdAt);
    if (!current || !isSameDay(new Date(current.lines[0].createdAt), created)) {
      current = {
        key: format(created, "yyyy-MM-dd"),
        label: dayLabel(created, locale, tx),
        lines: [],
      };
      groups.push(current);
    }
    current.lines.push(expense);
  }
  return groups;
}

export function MonthLinesChronological({ expenses, primaryCurrency, onTogglePaid }: Props) {
  const locale = useLocale();
  const t = useT();
  const tx = useTx();
  const groups = groupByDay(expenses, locale, tx);
  const pending = expenses.filter((e) => !e.paid).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-0.5">
          <CardTitle className="text-sm">{t.month.chronoTitle}</CardTitle>
          <p className="text-muted-foreground text-xs">
            {tx({ es: "orden cronológico · más nuevo primero", en: "chronological · newest first" })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-[11px] font-medium tabular-nums">
            {expenses.length}{" "}
            {expenses.length === 1
              ? tx({ es: "gasto", en: "expense" })
              : tx({ es: "gastos", en: "expenses" })}
          </span>
          {pending > 0 ? (
            <span className="bg-warn/15 text-warn rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums">
              {pending} {tx({ es: "sin pagar", en: "unpaid" })}
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        {expenses.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            {tx({ es: "Todavía no hay gastos en este mes.", en: "No expenses in this month yet." })}
          </p>
        ) : (
          <div className="space-y-1">
            {groups.map((group, groupIdx) => (
              <div key={group.key} className={cn(groupIdx > 0 && "pt-3")}>
                <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-[0.18em]">
                  {group.label}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {group.lines.map((expense) => {
                    const isInvestment = isInvestmentCategory(expense.category);
                    return (
                      <li key={expense.id}>
                        <label
                          className={cn(
                            "hover:bg-muted/50 flex min-h-[2.75rem] cursor-pointer items-center gap-3 rounded-lg border border-transparent px-2 py-2",
                            expense.paid && "opacity-70",
                          )}
                        >
                          <Checkbox
                            className="shrink-0"
                            checked={expense.paid}
                            onCheckedChange={(checked) =>
                              onTogglePaid(expense.id, checked === true)
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "flex items-center gap-1.5 truncate text-sm font-medium leading-tight",
                                expense.paid && "text-muted-foreground line-through",
                              )}
                            >
                              <span className="truncate">{expense.name}</span>
                              {isInvestment ? (
                                <span className="bg-cleo-violet/30 text-foreground inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-bold">
                                  <TrendingUp className="size-2.5" />
                                  {tx({ es: "inversión", en: "investment" })}
                                </span>
                              ) : null}
                            </p>
                            <p className="text-muted-foreground mt-0.5 truncate text-xs">
                              <span className="font-medium">{expense.bankName}</span>
                              <span className="mx-1">·</span>
                              <span>{expense.category.toLowerCase()}</span>
                            </p>
                          </div>
                          <p
                            className={cn(
                              "shrink-0 text-sm font-semibold tabular-nums",
                              expense.paid
                                ? "text-muted-foreground"
                                : isInvestment
                                  ? "text-cleo-violet"
                                  : "text-bad",
                            )}
                          >
                            {formatLineAmount(expense, primaryCurrency, locale)}
                          </p>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
