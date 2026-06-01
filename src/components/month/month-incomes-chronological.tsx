"use client";

import { format, isSameDay, isToday, isYesterday, parse } from "date-fns";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { MonthIncomeEditDialog } from "@/components/month/month-income-edit-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatLineAmount } from "@/lib/format";
import { dateLocale } from "@/lib/i18n/format";
import { useLocale, useT, useTx } from "@/lib/i18n/client";
import type { MonthIncomeLinePayload } from "@/lib/month-page-types";
import { cn } from "@/lib/utils";

import type { Locale } from "@/lib/i18n/locale";

type Bank = { id: string; name: string };

type Props = {
  incomes: MonthIncomeLinePayload[];
  primaryCurrency: string;
  monthKey: string;
  banks: Bank[];
  onToggleReceived: (lineId: string, nextReceived: boolean) => void;
  editable?: boolean;
  onMutated?: () => void;
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
    const dayDate = parse(income.occurredOn, "yyyy-MM-dd", new Date());
    if (
      !current ||
      !isSameDay(parse(current.lines[0].occurredOn, "yyyy-MM-dd", new Date()), dayDate)
    ) {
      current = {
        key: income.occurredOn,
        label: dayLabel(dayDate, locale, tx),
        lines: [],
      };
      groups.push(current);
    }
    current.lines.push(income);
  }
  return groups;
}

export function MonthIncomesChronological({
  incomes,
  primaryCurrency,
  monthKey,
  banks,
  onToggleReceived,
  editable = false,
  onMutated,
}: Props) {
  const locale = useLocale();
  const t = useT();
  const tx = useTx();
  const groups = groupByDay(incomes, locale, tx);
  const pending = incomes.filter((i) => !i.received).length;

  const [editLine, setEditLine] = useState<MonthIncomeLinePayload | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editBankId, setEditBankId] = useState("");
  const [editCategory, setEditCategory] = useState("OTROS");
  const [editOccurredOn, setEditOccurredOn] = useState("");
  const [editReceived, setEditReceived] = useState(true);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  function openEdit(line: MonthIncomeLinePayload) {
    setEditLine(line);
    setEditName(line.name);
    setEditAmount(line.amount);
    setEditBankId(line.bankId ?? "");
    setEditCategory(line.category);
    setEditOccurredOn(line.occurredOn);
    setEditReceived(line.received);
    setEditError(null);
    setEditOpen(true);
  }

  async function onSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editLine) return;
    setEditSaving(true);
    setEditError(null);
    const res = await fetch(`/api/months/${monthKey}/incomes/${editLine.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        amount: Number(editAmount),
        ...(editBankId ? { bankId: editBankId } : { bankId: null }),
        category: editCategory,
        occurredOn: editOccurredOn,
        received: editReceived,
        occurredOnSource: "USER",
      }),
    });
    setEditSaving(false);
    if (!res.ok) {
      const p = (await res.json().catch(() => ({}))) as { error?: string };
      setEditError(p.error ?? t.month.saveError);
      return;
    }
    setEditOpen(false);
    setEditLine(null);
    onMutated?.();
  }

  async function onDelete(line: MonthIncomeLinePayload) {
    if (!window.confirm(t.month.deleteIncomeConfirm)) return;
    setPendingId(line.id);
    const res = await fetch(`/api/months/${monthKey}/incomes/${line.id}`, {
      method: "DELETE",
    });
    setPendingId(null);
    if (!res.ok) {
      const p = (await res.json().catch(() => ({}))) as { error?: string };
      alert(p.error ?? t.month.saveError);
      return;
    }
    onMutated?.();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-0.5">
          <CardTitle className="text-sm">{t.month.incomesChronoTitle}</CardTitle>
          <p className="text-muted-foreground text-xs">
            {tx({
              es: "por fecha del cobro · más reciente primero",
              en: "by payment date · newest first",
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
                      <div
                        className={cn(
                          "hover:bg-muted/50 flex min-h-[2.75rem] items-center gap-3 rounded-lg border border-transparent px-2 py-2",
                          !income.received && "border-warn/30 bg-warn/5",
                          pendingId === income.id && "pointer-events-none opacity-50",
                        )}
                      >
                        <Checkbox
                          className="shrink-0"
                          checked={income.received}
                          disabled={!editable}
                          onCheckedChange={(checked) =>
                            editable && onToggleReceived(income.id, checked === true)
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
                            {income.occurredOnSource === "ESTIMATED" ? (
                              <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                                {t.month.estimatedDateBadge}
                              </Badge>
                            ) : null}
                          </p>
                          <p className="text-muted-foreground mt-0.5 truncate text-xs">
                            {income.bankName ? (
                              <>
                                <span className="font-medium">{income.bankName}</span>
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
                        {editable ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-md"
                              aria-label={tx({ es: "Más acciones", en: "More actions" })}
                            >
                              <MoreHorizontal className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(income)}>
                                <Pencil className="size-4" />
                                {t.month.editLineAction}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => void onDelete(income)}
                              >
                                <Trash2 className="size-4" />
                                {t.month.delete}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <MonthIncomeEditDialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditLine(null);
        }}
        line={editLine}
        banks={banks}
        saving={editSaving}
        error={editError}
        name={editName}
        amount={editAmount}
        bankId={editBankId}
        category={editCategory}
        occurredOn={editOccurredOn}
        received={editReceived}
        onChangeName={setEditName}
        onChangeAmount={setEditAmount}
        onChangeBankId={setEditBankId}
        onChangeCategory={setEditCategory}
        onChangeOccurredOn={setEditOccurredOn}
        onChangeReceived={setEditReceived}
        onSubmit={onSaveEdit}
      />
    </Card>
  );
}
