"use client";

import { format, isToday, isYesterday, parse } from "date-fns";
import {
  ChevronDown,
  ChevronRight,
  Luggage,
  MoreHorizontal,
  Pencil,
  Trash2,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { MonthLineEditDialog } from "@/components/month/month-line-edit-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency, formatLineAmount } from "@/lib/format";
import { dateLocale } from "@/lib/i18n/format";
import { useLocale, useT, useTx } from "@/lib/i18n/client";
import type { MonthLinePayload } from "@/lib/month-page-types";
import { cn } from "@/lib/utils";
import { isInvestmentCategory } from "@/lib/validators";

import type { Locale } from "@/lib/i18n/locale";

type Bank = { id: string; name: string };

type Props = {
  /** Pre-ordered desc por `occurredOn` desde el backend. */
  expenses: MonthLinePayload[];
  primaryCurrency: string;
  banks: Bank[];
  editable?: boolean;
  onTogglePaid: (lineId: string, nextPaid: boolean) => void;
  /** Llamado cuando se asocia/desasocia una línea a un evento — refresca página. */
  onLineEventChanged?: () => void;
  onMutated?: () => void;
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

/**
 * Item del listado cronológico. Puede ser un gasto suelto o un bucket de
 * evento (que adentro tiene los gastos individuales del mes pertenecientes
 * a esa billetera, agrupados visualmente).
 */
type DayItem =
  | { kind: "line"; line: MonthLinePayload; dayDate: Date }
  | {
      kind: "event";
      eventId: string;
      eventName: string;
      eventColor: string | null;
      eventStatus: "OPEN" | "CLOSED";
      lines: MonthLinePayload[];
      /** Suma en primary currency de las líneas en ESTE día. */
      totalThisDay: number;
      dayDate: Date;
    };

type DayGroup = { key: string; label: string; items: DayItem[] };

function groupByDayWithEvents(
  expenses: MonthLinePayload[],
  locale: Locale,
  tx: ReturnType<typeof useTx>,
): DayGroup[] {
  const groups: DayGroup[] = [];
  let current: DayGroup | null = null;
  // Buckets de evento por día — clave compuesta `${dayKey}|${eventId}`.
  const eventBucketByDay = new Map<string, DayItem & { kind: "event" }>();

  for (const expense of expenses) {
    const dayDate = parse(expense.occurredOn, "yyyy-MM-dd", new Date());
    const dayKey = expense.occurredOn;
    if (!current || current.key !== dayKey) {
      current = {
        key: dayKey,
        label: dayLabel(dayDate, locale, tx),
        items: [],
      };
      groups.push(current);
    }

    if (expense.event) {
      const bucketKey = `${dayKey}|${expense.event.id}`;
      let bucket = eventBucketByDay.get(bucketKey);
      if (!bucket) {
        bucket = {
          kind: "event",
          eventId: expense.event.id,
          eventName: expense.event.name,
          eventColor: expense.event.color,
          eventStatus: expense.event.status,
          lines: [],
          totalThisDay: 0,
          dayDate,
        };
        eventBucketByDay.set(bucketKey, bucket);
        current.items.push(bucket);
      }
      bucket.lines.push(expense);
      bucket.totalThisDay += Number(expense.amountConverted);
    } else {
      current.items.push({
        kind: "line",
        line: expense,
        dayDate,
      });
    }
  }
  return groups;
}

/**
 * Cache compartido en memoria de eventos OPEN del usuario, lazy-loaded la
 * primera vez que se abre el menú "sumar a evento" en cualquier fila.
 * Se invalida al asociar/desasociar para refrescar.
 */
type OpenEventOption = {
  id: string;
  name: string;
  color: string | null;
};

export function MonthLinesChronological({
  expenses,
  primaryCurrency,
  banks,
  editable = false,
  onTogglePaid,
  onLineEventChanged,
  onMutated,
}: Props) {
  const locale = useLocale();
  const t = useT();
  const tx = useTx();
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [openEvents, setOpenEvents] = useState<OpenEventOption[] | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [pendingLineId, setPendingLineId] = useState<string | null>(null);
  const [editLine, setEditLine] = useState<MonthLinePayload | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editBankId, setEditBankId] = useState("");
  const [editCategory, setEditCategory] = useState("OTROS");
  const [editOccurredOn, setEditOccurredOn] = useState("");
  const [editPaid, setEditPaid] = useState(true);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function openEdit(line: MonthLinePayload) {
    setEditLine(line);
    setEditName(line.name);
    setEditAmount(line.amount);
    setEditBankId(line.bankId);
    setEditCategory(line.category);
    setEditOccurredOn(line.occurredOn);
    setEditPaid(line.paid);
    setEditError(null);
    setEditOpen(true);
  }

  async function onSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editLine) return;
    setEditSaving(true);
    setEditError(null);
    const res = await fetch(`/api/month-expense-lines/${editLine.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        amount: Number(editAmount),
        bankId: editBankId,
        category: editCategory,
        occurredOn: editOccurredOn,
        paid: editPaid,
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
    onLineEventChanged?.();
  }

  async function onDeleteLine(line: MonthLinePayload) {
    if (!window.confirm(t.month.deleteConfirm)) return;
    setPendingLineId(line.id);
    const res = await fetch(`/api/month-expense-lines/${line.id}`, { method: "DELETE" });
    setPendingLineId(null);
    if (!res.ok) {
      const p = (await res.json().catch(() => ({}))) as { error?: string };
      alert(p.error ?? t.month.saveError);
      return;
    }
    onMutated?.();
    onLineEventChanged?.();
  }

  // Refetch en cada apertura del menú. Es una sola query liviana y evita
  // tener que coordinar un cache invalidator: si el usuario engancha o
  // desengancha algo, la próxima apertura ya ve la lista actual.
  const fetchOpenEvents = useCallback(async () => {
    if (loadingEvents) return;
    setLoadingEvents(true);
    try {
      const res = await fetch("/api/events?status=OPEN", { cache: "no-store" });
      if (!res.ok) {
        setOpenEvents([]);
        return;
      }
      const data = (await res.json()) as {
        events: Array<{ id: string; name: string; color: string | null }>;
      };
      setOpenEvents(
        data.events.map((e) => ({ id: e.id, name: e.name, color: e.color })),
      );
    } catch {
      setOpenEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }, [loadingEvents]);

  const groups = useMemo(
    () => groupByDayWithEvents(expenses, locale, tx),
    [expenses, locale, tx],
  );
  const pending = expenses.filter((e) => !e.paid).length;

  function toggleEventExpanded(key: string) {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function attachLineToEvent(lineId: string, eventId: string) {
    setPendingLineId(lineId);
    try {
      const res = await fetch(`/api/events/${eventId}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineId }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        alert(
          error.error ??
            tx({
              es: "No se pudo enganchar al evento.",
              en: "Could not attach to event.",
            }),
        );
        return;
      }
      onLineEventChanged?.();
    } finally {
      setPendingLineId(null);
    }
  }

  async function detachLineFromEvent(lineId: string, eventId: string) {
    setPendingLineId(lineId);
    try {
      const res = await fetch(`/api/events/${eventId}/lines/${lineId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        alert(
          error.error ??
            tx({
              es: "No se pudo desenganchar.",
              en: "Could not detach.",
            }),
        );
        return;
      }
      onLineEventChanged?.();
    } finally {
      setPendingLineId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-0.5">
          <CardTitle className="text-sm">{t.month.chronoTitle}</CardTitle>
          <p className="text-muted-foreground text-xs">
            {tx({
              es: "por fecha del movimiento · más reciente primero",
              en: "by transaction date · newest first",
            })}
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
            {tx({
              es: "Todavía no hay gastos en este mes.",
              en: "No expenses in this month yet.",
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
                  {group.items.map((item) => {
                    if (item.kind === "line") {
                      return (
                        <li key={item.line.id}>
                          <ExpenseRow
                            expense={item.line}
                            primaryCurrency={primaryCurrency}
                            locale={locale}
                            t={t}
                            tx={tx}
                            editable={editable}
                            isPending={pendingLineId === item.line.id}
                            openEvents={openEvents}
                            loadingEvents={loadingEvents}
                            onTogglePaid={onTogglePaid}
                            onEdit={() => openEdit(item.line)}
                            onDelete={() => void onDeleteLine(item.line)}
                            onAttach={(eventId) =>
                              attachLineToEvent(item.line.id, eventId)
                            }
                            onDetach={(eventId) =>
                              detachLineFromEvent(item.line.id, eventId)
                            }
                            onOpenEventsMenu={fetchOpenEvents}
                          />
                        </li>
                      );
                    }
                    const bucketKey = `${group.key}|${item.eventId}`;
                    const expanded = expandedEvents.has(bucketKey);
                    const lineCount = item.lines.length;
                    return (
                      <li key={bucketKey}>
                        <div className="hover:bg-muted/50 flex min-h-[2.75rem] items-center gap-3 rounded-lg border border-transparent px-2 py-2">
                          <button
                            type="button"
                            onClick={() => toggleEventExpanded(bucketKey)}
                            aria-expanded={expanded}
                            aria-label={
                              expanded
                                ? tx({ es: "Contraer", en: "Collapse" })
                                : tx({ es: "Expandir", en: "Expand" })
                            }
                            className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none"
                          >
                            <span
                              className="inline-flex size-2.5 shrink-0 rounded-full"
                              style={{
                                backgroundColor: item.eventColor ?? "#6b7280",
                              }}
                              aria-hidden="true"
                            />
                            <Luggage
                              className="text-muted-foreground size-3.5 shrink-0"
                              aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-1.5 truncate text-sm font-semibold leading-tight">
                                <span className="truncate">
                                  {item.eventName}
                                </span>
                                <span className="text-muted-foreground shrink-0 text-[10px] font-medium">
                                  ·{" "}
                                  {lineCount === 1
                                    ? tx({ es: "1 gasto", en: "1 expense" })
                                    : `${lineCount} ${tx({
                                        es: "gastos",
                                        en: "expenses",
                                      })}`}
                                </span>
                              </p>
                              <p className="text-muted-foreground mt-0.5 truncate text-xs">
                                {tx({
                                  es: "billetera de evento",
                                  en: "event wallet",
                                })}
                              </p>
                            </div>
                            <p className="text-bad shrink-0 text-sm font-semibold tabular-nums">
                              {formatCurrency(
                                item.totalThisDay,
                                primaryCurrency,
                                locale,
                              )}
                            </p>
                            {expanded ? (
                              <ChevronDown
                                className="text-muted-foreground size-4 shrink-0"
                                aria-hidden="true"
                              />
                            ) : (
                              <ChevronRight
                                className="text-muted-foreground size-4 shrink-0"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                          <Link
                            href={`/events/${item.eventId}`}
                            className="text-muted-foreground hover:text-foreground shrink-0 text-[11px] underline-offset-2 hover:underline"
                            aria-label={tx({
                              es: "Abrir billetera",
                              en: "Open wallet",
                            })}
                          >
                            {tx({ es: "abrir", en: "open" })}
                          </Link>
                        </div>
                        {expanded ? (
                          <ul className="border-l-muted ml-4 mt-1 space-y-0.5 border-l-2 pl-2">
                            {item.lines.map((expense) => (
                              <li key={expense.id}>
                                <ExpenseRow
                                  expense={expense}
                                  primaryCurrency={primaryCurrency}
                                  locale={locale}
                                  t={t}
                                  tx={tx}
                                  editable={editable}
                                  isPending={pendingLineId === expense.id}
                                  openEvents={openEvents}
                                  loadingEvents={loadingEvents}
                                  onTogglePaid={onTogglePaid}
                                  onEdit={() => openEdit(expense)}
                                  onDelete={() => void onDeleteLine(expense)}
                                  onAttach={(eventId) =>
                                    attachLineToEvent(expense.id, eventId)
                                  }
                                  onDetach={(eventId) =>
                                    detachLineFromEvent(expense.id, eventId)
                                  }
                                  onOpenEventsMenu={fetchOpenEvents}
                                />
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <MonthLineEditDialog
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
        paid={editPaid}
        onChangeName={setEditName}
        onChangeAmount={setEditAmount}
        onChangeBankId={setEditBankId}
        onChangeCategory={setEditCategory}
        onChangeOccurredOn={setEditOccurredOn}
        onChangePaid={setEditPaid}
        onSubmit={onSaveEdit}
      />
    </Card>
  );
}

function ExpenseRow({
  expense,
  primaryCurrency,
  locale,
  t,
  tx,
  editable,
  isPending,
  openEvents,
  loadingEvents,
  onTogglePaid,
  onEdit,
  onDelete,
  onAttach,
  onDetach,
  onOpenEventsMenu,
}: {
  expense: MonthLinePayload;
  primaryCurrency: string;
  locale: Locale;
  t: ReturnType<typeof useT>;
  tx: ReturnType<typeof useTx>;
  editable: boolean;
  isPending: boolean;
  openEvents: OpenEventOption[] | null;
  loadingEvents: boolean;
  onTogglePaid: (lineId: string, nextPaid: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onAttach: (eventId: string) => void;
  onDetach: (eventId: string) => void;
  onOpenEventsMenu: () => void;
}) {
  const isInvestment = isInvestmentCategory(expense.category);
  const eventRef = expense.event;
  const candidateEvents =
    openEvents?.filter((e) => e.id !== eventRef?.id) ?? null;

  return (
    <div
      className={cn(
        "hover:bg-muted/50 flex min-h-[2.75rem] items-center gap-3 rounded-lg border border-transparent px-2 py-2",
        expense.paid && "opacity-70",
        isPending && "pointer-events-none opacity-50",
      )}
    >
      <Checkbox
        className="shrink-0"
        checked={expense.paid}
        onCheckedChange={(checked) => onTogglePaid(expense.id, checked === true)}
        aria-label={tx({
          es: "Marcar como pagado",
          en: "Mark as paid",
        })}
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
          {expense.occurredOnSource === "ESTIMATED" ? (
            <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
              {t.month.estimatedDateBadge}
            </Badge>
          ) : null}
        </p>
        <p className="text-muted-foreground mt-0.5 truncate text-xs">
          <span className="font-medium">{expense.bankName}</span>
          <span className="mx-1">·</span>
          <span>{expense.category.toLowerCase()}</span>
          {eventRef ? (
            <>
              <span className="mx-1">·</span>
              <span
                className="inline-flex items-center gap-1"
                title={eventRef.name}
              >
                <span
                  className="inline-flex size-1.5 rounded-full"
                  style={{
                    backgroundColor: eventRef.color ?? "#6b7280",
                  }}
                  aria-hidden="true"
                />
                <span className="truncate">{eventRef.name}</span>
              </span>
            </>
          ) : null}
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
      <DropdownMenu onOpenChange={(open) => open && onOpenEventsMenu()}>
        <DropdownMenuTrigger
          className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label={tx({ es: "Más acciones", en: "More actions" })}
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {editable ? (
            <>
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="size-4" />
                {t.month.editLineAction}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 className="size-4" />
                {t.month.delete}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          {eventRef ? (
            <>
              <DropdownMenuLabel>
                {tx({ es: "Billetera de evento", en: "Event wallet" })}
              </DropdownMenuLabel>
              <DropdownMenuItem
                render={
                  <Link href={`/events/${eventRef.id}`}>
                    <Luggage />
                    <span className="truncate">{eventRef.name}</span>
                  </Link>
                }
              />
              {eventRef.status === "OPEN" ? (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onDetach(eventRef.id)}
                >
                  {tx({ es: "Sacar del evento", en: "Remove from event" })}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled>
                  {tx({
                    es: "Evento cerrado · reabrilo para editar",
                    en: "Event closed · reopen to edit",
                  })}
                </DropdownMenuItem>
              )}
              {candidateEvents && candidateEvents.length > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>
                    {tx({ es: "Cambiar de evento", en: "Move to event" })}
                  </DropdownMenuLabel>
                  {candidateEvents.map((option) => (
                    <DropdownMenuItem
                      key={option.id}
                      onClick={() => onAttach(option.id)}
                    >
                      <span
                        className="inline-flex size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: option.color ?? "#6b7280" }}
                        aria-hidden="true"
                      />
                      <span className="truncate">{option.name}</span>
                    </DropdownMenuItem>
                  ))}
                </>
              ) : null}
            </>
          ) : (
            <>
              <DropdownMenuLabel>
                {tx({
                  es: "Sumar a billetera de evento",
                  en: "Attach to event wallet",
                })}
              </DropdownMenuLabel>
              {openEvents === null || loadingEvents ? (
                <DropdownMenuItem disabled>
                  {tx({ es: "Cargando…", en: "Loading…" })}
                </DropdownMenuItem>
              ) : openEvents.length === 0 ? (
                <DropdownMenuItem disabled>
                  {tx({
                    es: "No tenés billeteras abiertas",
                    en: "No open wallets",
                  })}
                </DropdownMenuItem>
              ) : (
                openEvents.map((option) => (
                  <DropdownMenuItem
                    key={option.id}
                    onClick={() => onAttach(option.id)}
                  >
                    <span
                      className="inline-flex size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: option.color ?? "#6b7280" }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{option.name}</span>
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                render={
                  <Link href="/events">
                    <Luggage />
                    {tx({
                      es: "Crear nueva billetera",
                      en: "Create new wallet",
                    })}
                  </Link>
                }
              />
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
