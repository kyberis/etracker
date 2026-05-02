"use client";

import { format, parse } from "date-fns";
import { ArrowLeft, Lock, Plus, RotateCcw, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EventSharePanel,
  type ParticipantPayload,
  type SettlementPayload,
} from "@/components/event-share-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { useLocale, useTx } from "@/lib/i18n/client";
import { dateLocale } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

/** Misma paleta que `events-manager.tsx`. Si la cambiás, sincronizá ambas. */
const COLOR_PALETTE = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
] as const;

type EventPayload = {
  id: string;
  name: string;
  color: string | null;
  startDate: string;
  endDate: string | null;
  status: "OPEN" | "CLOSED";
  attributionMode: "BY_DATE" | "LUMP_SUM";
  attributionMonth: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  totalConverted: number;
  lineCount: number;
};

type LinePayload = {
  id: string;
  name: string;
  amountConverted: string;
  amount: string;
  currency: string;
  monthKey: string;
  occurredOn: string;
  bankName: string;
  category: string;
  paid: boolean;
  /** Set when the line lives in a multi-participant event. Optional so
   * legacy / candidate-attach payloads (which don't track this) still
   * conform to the type. */
  paidByUserId?: string | null;
};

type Props = {
  event: EventPayload;
  lines: LinePayload[];
  /** Líneas sin evento dentro del rango (con padding) — sugeridas para sumar. */
  candidatesInRange: LinePayload[];
  /** Cualquier línea sin evento — fallback cuando el usuario quiere ampliar. */
  candidatesAll: LinePayload[];
  primaryCurrency: string;
  /** Optional: viewer-aware fields that gate share controls + badges.
   * When omitted (legacy callers) the component degrades gracefully:
   * no share dialog, no participant list, no settlement card. */
  currentUserId?: string;
  isOwner?: boolean;
  participants?: ParticipantPayload[];
  settlement?: SettlementPayload | null;
};

function formatDateLabel(iso: string, locale: ReturnType<typeof useLocale>): string {
  try {
    const date = parse(iso, "yyyy-MM-dd", new Date());
    return format(date, "d MMM yyyy", { locale: dateLocale(locale) });
  } catch {
    return iso;
  }
}

export function EventDetail({
  event,
  lines,
  candidatesInRange,
  candidatesAll,
  primaryCurrency,
  currentUserId,
  isOwner = true,
  participants,
  settlement,
}: Props) {
  const tx = useTx();
  const locale = useLocale();
  const router = useRouter();
  const [isClosing, setIsClosing] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);

  // For the "Pagó X" badge per line and the share panel: build a name
  // lookup once. Falls back to "?" when the row predates the join (or
  // the participant was hard-deleted, which currently shouldn't happen
  // — removeParticipant tombstones).
  const participantNameById = new Map<string, string>();
  if (participants) {
    for (const p of participants) participantNameById.set(p.userId, p.displayName);
  }
  // Multi-participant events show "Paid by X" pills; single-participant
  // events would just say "Paid by you" everywhere which is noise.
  const showPaidByBadges = (participants?.length ?? 0) >= 2;

  const monthKeysWithSpend = new Map<string, number>();
  for (const line of lines) {
    monthKeysWithSpend.set(
      line.monthKey,
      (monthKeysWithSpend.get(line.monthKey) ?? 0) + Number(line.amountConverted),
    );
  }
  const suggestedMonth = [...monthKeysWithSpend.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0];

  async function handleClose(input: {
    attributionMode: "BY_DATE" | "LUMP_SUM";
    attributionMonth?: string;
  }) {
    setIsPending(true);
    try {
      const res = await fetch(`/api/events/${event.id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        alert(error.error ?? tx({ es: "No se pudo cerrar.", en: "Could not close." }));
        return;
      }
      setIsClosing(false);
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  async function handleReopen() {
    setIsPending(true);
    try {
      const res = await fetch(`/api/events/${event.id}/reopen`, {
        method: "POST",
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        alert(
          error.error ?? tx({ es: "No se pudo reabrir.", en: "Could not reopen." }),
        );
        return;
      }
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        tx({
          es: "¿Borrar la billetera de evento? Los gastos asociados quedan como gastos sueltos.",
          en: "Delete the event wallet? Associated expenses become standalone expenses.",
        }),
      )
    ) {
      return;
    }
    setIsPending(true);
    try {
      const res = await fetch(`/api/events/${event.id}`, { method: "DELETE" });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        alert(error.error ?? tx({ es: "No se pudo borrar.", en: "Could not delete." }));
        return;
      }
      router.push("/events");
    } finally {
      setIsPending(false);
    }
  }

  async function handleDetachLine(lineId: string) {
    setIsPending(true);
    try {
      const res = await fetch(`/api/events/${event.id}/lines/${lineId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        alert(error.error ?? tx({ es: "No se pudo desenganchar.", en: "Could not detach." }));
        return;
      }
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  /**
   * Asocia varios gastos al evento en una sola pasada. Hace los POST en
   * paralelo pero conserva los errores individuales para que el usuario
   * sepa qué falló (por ejemplo si una línea ya quedó tomada por otro
   * evento entre el momento del render y la confirmación).
   */
  async function handleBulkAttach(lineIds: string[]) {
    if (lineIds.length === 0) {
      setIsAttaching(false);
      return;
    }
    setIsPending(true);
    try {
      const results = await Promise.all(
        lineIds.map(async (lineId) => {
          const res = await fetch(`/api/events/${event.id}/lines`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lineId }),
          });
          return { lineId, ok: res.ok };
        }),
      );
      const failed = results.filter((r) => !r.ok).length;
      if (failed > 0) {
        alert(
          tx({
            es: `No se pudieron sumar ${failed} de ${lineIds.length} gastos.`,
            en: `Could not attach ${failed} of ${lineIds.length} expenses.`,
          }),
        );
      }
      setIsAttaching(false);
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/events"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ArrowLeft className="mr-1.5 size-4" />
          {tx({ es: "Volver", en: "Back" })}
        </Link>
        <div className="flex items-center gap-2">
          {event.status === "OPEN" ? (
            <>
              <Button
                onClick={() => setEditingMeta(true)}
                variant="outline"
                size="sm"
              >
                {tx({ es: "Editar", en: "Edit" })}
              </Button>
              <Button
                onClick={() => setIsClosing(true)}
                size="sm"
                disabled={isPending}
              >
                <Lock className="mr-1.5 size-4" />
                {tx({ es: "Cerrar billetera", en: "Close wallet" })}
              </Button>
            </>
          ) : (
            <Button
              onClick={handleReopen}
              size="sm"
              variant="outline"
              disabled={isPending}
            >
              <RotateCcw className="mr-1.5 size-4" />
              {tx({ es: "Reabrir", en: "Reopen" })}
            </Button>
          )}
          <Button
            onClick={handleDelete}
            size="sm"
            variant="ghost"
            disabled={isPending}
            aria-label={tx({ es: "Borrar", en: "Delete" })}
          >
            <Trash2 className="text-bad size-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span
              className="size-4 rounded-full"
              style={{ backgroundColor: event.color ?? "#6b7280" }}
              aria-hidden="true"
            />
            <CardTitle className="text-2xl">{event.name}</CardTitle>
            {event.status === "OPEN" ? (
              <span className="bg-good/15 text-good rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                {tx({ es: "abierta", en: "open" })}
              </span>
            ) : (
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                {tx({ es: "cerrada", en: "closed" })}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">
            {formatDateLabel(event.startDate, locale)}{" "}
            {event.endDate ? (
              <>→ {formatDateLabel(event.endDate, locale)}</>
            ) : (
              <>→ {tx({ es: "sin fecha de fin", en: "no end date" })}</>
            )}
          </p>
          <p className="text-3xl font-semibold tabular-nums">
            {formatCurrency(event.totalConverted, primaryCurrency, locale)}
          </p>
          <p className="text-muted-foreground text-xs">
            {event.lineCount === 1
              ? tx({ es: "1 gasto", en: "1 expense" })
              : `${event.lineCount} ${tx({ es: "gastos", en: "expenses" })}`}
            {event.attributionMonth ? (
              <>
                {" · "}
                {tx({ es: "imputado a", en: "attributed to" })}{" "}
                {event.attributionMonth}
              </>
            ) : null}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm">
            {tx({ es: "Gastos asociados", en: "Associated expenses" })}
          </CardTitle>
          {event.status === "OPEN" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAttaching(true)}
              disabled={
                isPending ||
                (candidatesInRange.length === 0 && candidatesAll.length === 0)
              }
            >
              <Plus className="mr-1.5 size-4" />
              {tx({ es: "Sumar gastos", en: "Add expenses" })}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {lines.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {tx({
                es: "Sin gastos en esta billetera todavía. Cargá uno desde el chat, sumá uno existente con \"Sumar gastos\", o desde el dashboard del mes.",
                en: "No expenses in this wallet yet. Add one from chat, attach an existing one with \"Add expenses\", or from the month dashboard.",
              })}
            </p>
          ) : (
            <ul className="divide-y">
              {lines.map((line) => (
                <li
                  key={line.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{line.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {line.bankName} · {line.category.toLowerCase()} ·{" "}
                      {formatDateLabel(line.occurredOn, locale)}
                    </p>
                    {showPaidByBadges && line.paidByUserId ? (
                      <p className="text-muted-foreground mt-1 text-[11px]">
                        <span className="border-border/60 bg-muted/40 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                          {tx({ es: "Pagó", en: "Paid by" })}{" "}
                          {line.paidByUserId === currentUserId
                            ? tx({ es: "vos", en: "you" })
                            : (participantNameById.get(line.paidByUserId) ??
                              "?")}
                        </span>
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatCurrency(
                      Number(line.amountConverted),
                      primaryCurrency,
                      locale,
                    )}
                  </p>
                  {event.status === "OPEN" && isOwner ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDetachLine(line.id)}
                      disabled={isPending}
                      aria-label={tx({
                        es: "Desenganchar",
                        en: "Detach",
                      })}
                    >
                      <X className="size-3.5" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {participants && currentUserId ? (
        <EventSharePanel
          eventId={event.id}
          eventStatus={event.status}
          isOwner={isOwner}
          currentUserId={currentUserId}
          participants={participants}
          settlement={settlement ?? null}
          onRefresh={() => router.refresh()}
        />
      ) : null}

      <CloseEventDialog
        open={isClosing}
        onOpenChange={setIsClosing}
        isPending={isPending}
        suggestedMonth={suggestedMonth ?? null}
        availableMonths={[...monthKeysWithSpend.keys()].sort()}
        onSubmit={handleClose}
      />

      <EditEventDialog
        open={editingMeta}
        onOpenChange={setEditingMeta}
        isPending={isPending}
        event={event}
        onSubmit={async (patch) => {
          setIsPending(true);
          try {
            const res = await fetch(`/api/events/${event.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patch),
            });
            if (!res.ok) {
              const error = await res.json().catch(() => ({}));
              alert(
                error.error ??
                  tx({ es: "No se pudo guardar.", en: "Could not save." }),
              );
              return;
            }
            setEditingMeta(false);
            router.refresh();
          } finally {
            setIsPending(false);
          }
        }}
      />

      <BulkAttachDialog
        open={isAttaching}
        onOpenChange={setIsAttaching}
        isPending={isPending}
        candidatesInRange={candidatesInRange}
        candidatesAll={candidatesAll}
        primaryCurrency={primaryCurrency}
        eventName={event.name}
        onSubmit={handleBulkAttach}
      />
    </div>
  );
}

function BulkAttachDialog({
  open,
  onOpenChange,
  isPending,
  candidatesInRange,
  candidatesAll,
  primaryCurrency,
  eventName,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  isPending: boolean;
  candidatesInRange: LinePayload[];
  candidatesAll: LinePayload[];
  primaryCurrency: string;
  eventName: string;
  onSubmit: (lineIds: string[]) => void | Promise<void>;
}) {
  const tx = useTx();
  const locale = useLocale();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(candidatesInRange.length === 0);

  // Reset al abrir el diálogo, sin useEffect (patrón aprobado por React de
  // setear estado en render guardado por una versión).
  const [openCycle, setOpenCycle] = useState(open);
  if (openCycle !== open) {
    setOpenCycle(open);
    if (open) {
      setSelected(new Set());
      setShowAll(candidatesInRange.length === 0);
    }
  }

  const visible = showAll ? candidatesAll : candidatesInRange;
  const totalSelected = visible
    .filter((line) => selected.has(line.id))
    .reduce((sum, line) => sum + Number(line.amountConverted), 0);

  function toggle(lineId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void onSubmit([...selected]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {tx({ es: "Sumar gastos a", en: "Add expenses to" })} {eventName}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs">
              {showAll
                ? tx({
                    es: "Todos los gastos sin evento",
                    en: "All expenses without an event",
                  })
                : tx({
                    es: "Gastos cerca de las fechas del evento",
                    en: "Expenses near the event dates",
                  })}
            </p>
            {candidatesAll.length > candidatesInRange.length ? (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
              >
                {showAll
                  ? tx({
                      es: "Ver solo cercanos",
                      en: "Show only nearby",
                    })
                  : tx({
                      es: "Ver todos",
                      en: "Show all",
                    })}
              </button>
            ) : null}
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border">
            {visible.length === 0 ? (
              <p className="text-muted-foreground p-6 text-center text-sm">
                {tx({
                  es: "No hay gastos sueltos para sumar.",
                  en: "No standalone expenses available.",
                })}
              </p>
            ) : (
              <ul className="divide-y">
                {visible.map((line) => {
                  const checked = selected.has(line.id);
                  return (
                    <li key={line.id}>
                      <label className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 px-3 py-2">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggle(line.id)}
                          aria-label={line.name}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {line.name}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {line.bankName} · {formatDateLabel(line.occurredOn, locale)}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold tabular-nums">
                          {formatCurrency(
                            Number(line.amountConverted),
                            primaryCurrency,
                            locale,
                          )}
                        </p>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {selected.size > 0 ? (
            <p className="text-muted-foreground text-xs">
              {selected.size === 1
                ? tx({ es: "1 gasto seleccionado", en: "1 expense selected" })
                : `${selected.size} ${tx({
                    es: "gastos seleccionados",
                    en: "expenses selected",
                  })}`}
              {" · "}
              {formatCurrency(totalSelected, primaryCurrency, locale)}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {tx({ es: "Cancelar", en: "Cancel" })}
            </Button>
            <Button
              type="submit"
              disabled={isPending || selected.size === 0}
            >
              {tx({ es: "Sumar", en: "Add" })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CloseEventDialog({
  open,
  onOpenChange,
  isPending,
  suggestedMonth,
  availableMonths,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  isPending: boolean;
  suggestedMonth: string | null;
  availableMonths: string[];
  onSubmit: (input: {
    attributionMode: "BY_DATE" | "LUMP_SUM";
    attributionMonth?: string;
  }) => void | Promise<void>;
}) {
  const tx = useTx();
  const [mode, setMode] = useState<"BY_DATE" | "LUMP_SUM">("LUMP_SUM");
  const [month, setMonth] = useState<string>(suggestedMonth ?? "");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === "LUMP_SUM" && !month) return;
    void onSubmit({
      attributionMode: mode,
      attributionMonth: mode === "LUMP_SUM" ? month : undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {tx({ es: "Cerrar billetera", en: "Close wallet" })}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>
              {tx({
                es: "¿Cómo querés imputar los gastos?",
                en: "How do you want to attribute the expenses?",
              })}
            </Label>
            <div className="space-y-2">
              <label className="flex items-start gap-2 rounded-lg border p-3">
                <input
                  type="radio"
                  name="mode"
                  value="LUMP_SUM"
                  checked={mode === "LUMP_SUM"}
                  onChange={() => setMode("LUMP_SUM")}
                  className="mt-0.5"
                />
                <div className="text-sm">
                  <p className="font-semibold">
                    {tx({
                      es: "Todo a un solo mes (recomendado)",
                      en: "All to a single month (recommended)",
                    })}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {tx({
                      es: "Mueve todos los gastos al mes que elijas. Útil para viajes que cruzan meses.",
                      en: "Moves every expense to the month you pick. Useful for trips that cross months.",
                    })}
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-2 rounded-lg border p-3">
                <input
                  type="radio"
                  name="mode"
                  value="BY_DATE"
                  checked={mode === "BY_DATE"}
                  onChange={() => setMode("BY_DATE")}
                  className="mt-0.5"
                />
                <div className="text-sm">
                  <p className="font-semibold">
                    {tx({
                      es: "Cada gasto en su mes real",
                      en: "Keep each expense in its real month",
                    })}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {tx({
                      es: "No se mueve nada. Cada gasto queda donde fue.",
                      en: "Nothing moves. Each expense stays where it was logged.",
                    })}
                  </p>
                </div>
              </label>
            </div>
          </div>

          {mode === "LUMP_SUM" ? (
            <div className="space-y-1.5">
              <Label htmlFor="attribution-month">
                {tx({ es: "Mes destino (yyyy-MM)", en: "Target month (yyyy-MM)" })}
              </Label>
              <Input
                id="attribution-month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                required
              />
              {suggestedMonth ? (
                <p className="text-muted-foreground text-xs">
                  {tx({ es: "Sugerencia:", en: "Suggested:" })} {suggestedMonth}
                  {availableMonths.length > 1 ? (
                    <>
                      {" · "}
                      {tx({ es: "meses con gasto:", en: "months with spend:" })}{" "}
                      {availableMonths.join(", ")}
                    </>
                  ) : null}
                </p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {tx({ es: "Cancelar", en: "Cancel" })}
            </Button>
            <Button type="submit" disabled={isPending}>
              {tx({ es: "Cerrar", en: "Close" })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditEventDialog({
  open,
  onOpenChange,
  isPending,
  event,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  isPending: boolean;
  event: EventPayload;
  onSubmit: (patch: {
    name?: string;
    startDate?: string;
    endDate?: string | null;
    color?: string | null;
  }) => void | Promise<void>;
}) {
  const tx = useTx();
  const [name, setName] = useState(event.name);
  const [startDate, setStartDate] = useState(event.startDate);
  const [endDate, setEndDate] = useState(event.endDate ?? "");
  const [color, setColor] = useState<string>(event.color ?? "");

  // Reset al abrir o cuando cambia el evento subyacente. Patrón de
  // "almacenar info de un render previo" — React permite llamar a
  // setState en render si va guardado por un check, evita useEffect
  // (https://react.dev/learn/you-might-not-need-an-effect).
  const [openCycleSeed, setOpenCycleSeed] = useState({
    open,
    eventId: event.id,
  });
  if (
    openCycleSeed.open !== open ||
    openCycleSeed.eventId !== event.id
  ) {
    setOpenCycleSeed({ open, eventId: event.id });
    if (open) {
      setName(event.name);
      setStartDate(event.startDate);
      setEndDate(event.endDate ?? "");
      setColor(event.color ?? "");
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const patch: {
      name?: string;
      startDate?: string;
      endDate?: string | null;
      color?: string | null;
    } = {};
    if (name.trim() && name.trim() !== event.name) {
      patch.name = name.trim();
    }
    if (startDate && startDate !== event.startDate) {
      patch.startDate = startDate;
    }
    const nextEnd = endDate || null;
    if (nextEnd !== event.endDate) {
      patch.endDate = nextEnd;
    }
    const nextColor = color || null;
    if (nextColor !== (event.color ?? null)) {
      patch.color = nextColor;
    }
    if (Object.keys(patch).length === 0) {
      onOpenChange(false);
      return;
    }
    void onSubmit(patch);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {tx({ es: "Editar billetera", en: "Edit wallet" })}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-event-name">
              {tx({ es: "Nombre", en: "Name" })}
            </Label>
            <Input
              id="edit-event-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-event-start">
                {tx({ es: "Inicio", en: "Start" })}
              </Label>
              <Input
                id="edit-event-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-event-end">
                {tx({ es: "Fin", en: "End" })}
              </Label>
              <Input
                id="edit-event-end"
                type="date"
                min={startDate}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{tx({ es: "Color", en: "Color" })}</Label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setColor("")}
                aria-pressed={color === ""}
                aria-label={tx({ es: "Sin color", en: "No color" })}
                className={cn(
                  "bg-background relative flex h-7 w-7 items-center justify-center rounded-full border-2",
                  color === ""
                    ? "border-foreground"
                    : "border-border hover:border-foreground/60",
                )}
              >
                <span className="bg-muted-foreground/60 absolute h-[2px] w-4 -rotate-45 rounded-full" />
              </button>
              {COLOR_PALETTE.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  aria-pressed={color === swatch}
                  aria-label={swatch}
                  className={cn(
                    "h-7 w-7 rounded-full border-2 transition-all",
                    color === swatch
                      ? "border-foreground scale-110"
                      : "border-transparent hover:scale-105",
                  )}
                  style={{ backgroundColor: swatch }}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {tx({ es: "Cancelar", en: "Cancel" })}
            </Button>
            <Button type="submit" disabled={isPending}>
              {tx({ es: "Guardar", en: "Save" })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
