"use client";

import { ChevronDown, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency, formatLineAmount } from "@/lib/format";
import type { MonthLinePayload, MonthPageDataWithRecord } from "@/lib/month-page-types";
import { cn } from "@/lib/utils";
import { isInvestmentCategory } from "@/lib/validators";

type Props = {
  bankTotals: MonthPageDataWithRecord["bankTotals"];
  expensesByBank: Map<string, MonthLinePayload[]>;
  bankCollapsed: Record<string, boolean>;
  onToggleCollapsed: (bankId: string) => void;
  onTogglePaid: (lineId: string, nextPaid: boolean) => void;
  /** ISO 4217 currency for bank/totals — always the user's primary. */
  primaryCurrency: string;
};

export function MonthLinesByBank({
  bankTotals,
  expensesByBank,
  bankCollapsed,
  onToggleCollapsed,
  onTogglePaid,
  primaryCurrency,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {bankTotals.map((bank) => {
        const bankExpenses = expensesByBank.get(bank.bankId) ?? [];
        // Totals always live in the primary currency (we sum amountConverted).
        const bankPlanned = bankExpenses.reduce(
          (sum, item) => sum + Number(item.amountConverted),
          0,
        );
        const bankPaid = bankExpenses
          .filter((item) => item.paid)
          .reduce((sum, item) => sum + Number(item.amountConverted), 0);
        const bankPending = bankPlanned - bankPaid;
        if (bankExpenses.length === 0) return null;

        const expanded = bankCollapsed[bank.bankId] !== true;

        return (
          <Card
            key={bank.bankId}
            className="flex min-h-0 min-w-0 flex-col overflow-hidden py-0"
          >
            <div className="border-b">
              <button
                type="button"
                className="hover:bg-muted/50 flex w-full min-w-0 items-start justify-between gap-2 py-2 pr-2 pl-1.5 text-left"
                onClick={() => onToggleCollapsed(bank.bankId)}
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
                  <p className="text-bad text-sm font-semibold tabular-nums">
                    {formatCurrency(bankPlanned, primaryCurrency)}
                  </p>
                  {bankPending > 0 ? (
                    <p className="text-warn text-[11px] tabular-nums">
                      {formatCurrency(bankPending, primaryCurrency)} pendiente
                    </p>
                  ) : (
                    <p className="text-good text-[11px]">✓ Todo pagado</p>
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
                        onTogglePaid(expense.id, checked === true)
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium leading-tight">
                        {expense.name}
                        {isInvestmentCategory(expense.category) ? (
                          <span className="bg-cleo-violet/30 text-foreground ml-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-bold">
                            <TrendingUp className="size-2.5" />
                            inversión
                          </span>
                        ) : null}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {expense.category ? `${expense.category.toLowerCase()} · ` : null}
                        <span
                          className={cn(
                            "tabular-nums",
                            isInvestmentCategory(expense.category)
                              ? "text-cleo-violet"
                              : "text-bad",
                          )}
                        >
                          {formatLineAmount(expense, primaryCurrency)}
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
  );
}
