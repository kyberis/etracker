"use client";

import { format, parse } from "date-fns";
import { Luggage, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { useLocale, useTx } from "@/lib/i18n/client";
import { dateLocale } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

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

type Props = {
  initialEvents: EventPayload[];
  primaryCurrency: string;
};

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

function formatDateLabel(iso: string, locale: ReturnType<typeof useLocale>): string {
  try {
    const date = parse(iso, "yyyy-MM-dd", new Date());
    return format(date, "d MMM yyyy", { locale: dateLocale(locale) });
  } catch {
    return iso;
  }
}

export function EventsManager({ initialEvents, primaryCurrency }: Props) {
  const locale = useLocale();
  const tx = useTx();
  const [events, setEvents] = useState(initialEvents);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const openEvents = useMemo(
    () => events.filter((e) => e.status === "OPEN"),
    [events],
  );
  const closedEvents = useMemo(
    () => events.filter((e) => e.status === "CLOSED"),
    [events],
  );

  async function refresh() {
    const res = await fetch("/api/events", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { events: EventPayload[] };
    setEvents(data.events);
  }

  async function handleCreate(input: {
    name: string;
    startDate: string;
    endDate?: string;
    color?: string;
  }) {
    setPendingId("__new__");
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          attributionMode: "LUMP_SUM",
        }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        alert(error.error ?? tx({ es: "No se pudo crear.", en: "Could not create." }));
        return;
      }
      await refresh();
      setIsCreating(false);
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(id: string) {
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
    setPendingId(id);
    try {
      const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        alert(error.error ?? tx({ es: "No se pudo borrar.", en: "Could not delete." }));
        return;
      }
      await refresh();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {tx({
            es: "Las billeteras de evento agrupan gastos durante un rango de fechas (viajes, casamientos, eventos puntuales). Mientras la billetera está abierta, cada gasto vive en su mes real; al cerrarla con LUMP_SUM, todos los gastos se imputan a un único mes.",
            en: "Event wallets group expenses over a date range (trips, weddings, one-off events). While open, each expense lives in its real month; when you close with LUMP_SUM, all expenses are attributed to a single month.",
          })}
        </p>
        <Button onClick={() => setIsCreating(true)} className="shrink-0">
          <Plus className="mr-1.5 size-4" />
          {tx({ es: "Nueva billetera", en: "New wallet" })}
        </Button>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {tx({ es: "Abiertas", en: "Open" })}
        </h2>
        {openEvents.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground py-8 text-center text-sm">
              {tx({
                es: "Sin billeteras abiertas. Creá una para tu próximo viaje o evento.",
                en: "No open wallets. Create one for your next trip or event.",
              })}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {openEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                primaryCurrency={primaryCurrency}
                locale={locale}
                isPending={pendingId === event.id}
                onDelete={() => handleDelete(event.id)}
              />
            ))}
          </div>
        )}
      </section>

      {closedEvents.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {tx({ es: "Cerradas", en: "Closed" })}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {closedEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                primaryCurrency={primaryCurrency}
                locale={locale}
                isPending={pendingId === event.id}
                onDelete={() => handleDelete(event.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <CreateEventDialog
        open={isCreating}
        onOpenChange={setIsCreating}
        isPending={pendingId === "__new__"}
        onSubmit={handleCreate}
      />
    </div>
  );
}

function EventCard({
  event,
  primaryCurrency,
  locale,
  isPending,
  onDelete,
}: {
  event: EventPayload;
  primaryCurrency: string;
  locale: ReturnType<typeof useLocale>;
  isPending: boolean;
  onDelete: () => void;
}) {
  const tx = useTx();
  const dotColor = event.color ?? "#6b7280";
  return (
    <Card className={cn(event.status === "CLOSED" && "opacity-80")}>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span
            className="mt-1 inline-flex size-3 shrink-0 rounded-full"
            style={{ backgroundColor: dotColor }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <CardTitle className="text-base">
              <Link
                href={`/events/${event.id}`}
                className="hover:underline focus-visible:outline-none"
              >
                {event.name}
              </Link>
            </CardTitle>
            <p className="text-muted-foreground text-xs">
              {formatDateLabel(event.startDate, locale)}{" "}
              {event.endDate
                ? `→ ${formatDateLabel(event.endDate, locale)}`
                : `→ ${tx({ es: "abierto", en: "open-ended" })}`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-semibold tabular-nums">
            {formatCurrency(event.totalConverted, primaryCurrency, locale)}
          </p>
          <p className="text-muted-foreground text-xs">
            {event.lineCount === 0
              ? tx({ es: "sin gastos", en: "no expenses" })
              : event.lineCount === 1
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
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/events/${event.id}`}
            aria-label={tx({ es: "Editar", en: "Edit" })}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Pencil className="size-3.5" />
          </Link>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            disabled={isPending}
            aria-label={tx({ es: "Borrar", en: "Delete" })}
          >
            <Trash2 className="text-bad size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateEventDialog({
  open,
  onOpenChange,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  isPending: boolean;
  onSubmit: (input: {
    name: string;
    startDate: string;
    endDate?: string;
    color?: string;
  }) => void | Promise<void>;
}) {
  const tx = useTx();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return format(today, "yyyy-MM-dd");
  });
  const [endDate, setEndDate] = useState("");
  const [color, setColor] = useState<string>("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !startDate) return;
    void onSubmit({
      name: name.trim(),
      startDate,
      endDate: endDate || undefined,
      color: color || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Luggage className="size-5" />
            {tx({ es: "Nueva billetera de evento", en: "New event wallet" })}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="event-name">
              {tx({ es: "Nombre", en: "Name" })}
            </Label>
            <Input
              id="event-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tx({
                es: "Viaje a Mendoza",
                en: "Trip to Mendoza",
              })}
              maxLength={120}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="event-start">
                {tx({ es: "Inicio", en: "Start" })}
              </Label>
              <Input
                id="event-start"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-end">
                {tx({ es: "Fin (opcional)", en: "End (optional)" })}
              </Label>
              <Input
                id="event-end"
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
              {tx({ es: "Crear", en: "Create" })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
