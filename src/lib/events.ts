import {
  EventAttributionMode,
  EventStatus,
  Prisma,
  type Event as PrismaEvent,
} from "@prisma/client";

import { db } from "@/lib/db";
import {
  formatMonthKey,
  parseMonthKey,
  toMonthStart,
} from "@/lib/months";
import { expireYearTimeline } from "@/lib/year-timeline-data";

/**
 * Servicio de billeteras de evento (`Event`).
 *
 * Diseño:
 * - Mientras `status = OPEN`, las líneas viven en su `MonthRecord` real
 *   (por `occurredOn`). El `eventId` solo agrupa visualmente.
 * - Al cerrar con `attributionMode = LUMP_SUM` y un `attributionMonthId`,
 *   se mueven todas las líneas del evento a ese mes en una sola
 *   transacción. Se preserva `occurredOn` (auditoría); el índice de
 *   dedupe no incluye `monthRecordId` así que no se viola.
 * - `reopenEvent` revierte el rebucket: cada línea vuelve al `MonthRecord`
 *   que corresponde a su `occurredOn`. Si ese mes no existe todavía,
 *   se crea on-the-fly (vacío) — los gastos no pueden quedar huérfanos.
 *
 * El rebucket toca el cache anual (`expireYearTimeline`) para los meses
 * involucrados, igual que el resto de mutaciones que mueven líneas.
 */

export type EventPayload = {
  id: string;
  name: string;
  color: string | null;
  startDate: string;
  endDate: string | null;
  status: EventStatus;
  attributionMode: EventAttributionMode;
  attributionMonth: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Total convertido a primary currency. */
  totalConverted: number;
  /** Cantidad de líneas asociadas. */
  lineCount: number;
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toEventPayload(
  event: PrismaEvent & {
    attributionMonth: { month: Date } | null;
    _count?: { lines: number };
    lines?: Array<{ amountConverted: Prisma.Decimal }>;
  },
): EventPayload {
  const total =
    event.lines?.reduce(
      (acc, line) => acc.plus(line.amountConverted),
      new Prisma.Decimal(0),
    ) ?? new Prisma.Decimal(0);
  return {
    id: event.id,
    name: event.name,
    color: event.color,
    startDate: toIsoDate(event.startDate),
    endDate: event.endDate ? toIsoDate(event.endDate) : null,
    status: event.status,
    attributionMode: event.attributionMode,
    attributionMonth: event.attributionMonth
      ? formatMonthKey(event.attributionMonth.month)
      : null,
    closedAt: event.closedAt ? event.closedAt.toISOString() : null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    totalConverted: Number(total),
    lineCount: event._count?.lines ?? event.lines?.length ?? 0,
  };
}

export type CreateEventInput = {
  userId: string;
  name: string;
  startDate: Date;
  endDate?: Date | null;
  color?: string | null;
  attributionMode?: EventAttributionMode;
};

export async function createEvent(input: CreateEventInput): Promise<EventPayload> {
  if (input.endDate && input.endDate < input.startDate) {
    throw new Error("EVENT_INVALID_RANGE");
  }
  const created = await db.event.create({
    data: {
      userId: input.userId,
      name: input.name.trim(),
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      color: normalizeColor(input.color),
      attributionMode: input.attributionMode ?? EventAttributionMode.LUMP_SUM,
    },
    include: {
      attributionMonth: { select: { month: true } },
      _count: { select: { lines: true } },
    },
  });
  return toEventPayload(created);
}

export type UpdateEventInput = {
  userId: string;
  eventId: string;
  name?: string;
  startDate?: Date;
  endDate?: Date | null;
  color?: string | null;
  attributionMode?: EventAttributionMode;
};

export async function updateEvent(
  input: UpdateEventInput,
): Promise<EventPayload | null> {
  const existing = await db.event.findFirst({
    where: { id: input.eventId, userId: input.userId },
    select: { id: true, status: true, startDate: true, endDate: true },
  });
  if (!existing) return null;
  if (existing.status === EventStatus.CLOSED) {
    throw new Error("EVENT_CLOSED");
  }
  const nextStart = input.startDate ?? existing.startDate;
  const nextEnd =
    input.endDate === undefined ? existing.endDate : input.endDate;
  if (nextEnd && nextEnd < nextStart) {
    throw new Error("EVENT_INVALID_RANGE");
  }
  const updated = await db.event.update({
    where: { id: existing.id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      ...(input.color !== undefined
        ? { color: normalizeColor(input.color) }
        : {}),
      ...(input.attributionMode !== undefined
        ? { attributionMode: input.attributionMode }
        : {}),
    },
    include: {
      attributionMonth: { select: { month: true } },
      lines: { select: { amountConverted: true } },
      _count: { select: { lines: true } },
    },
  });
  return toEventPayload(updated);
}

export async function deleteEvent(
  userId: string,
  eventId: string,
): Promise<{ ok: true; detachedLineCount: number } | { ok: false }> {
  const existing = await db.event.findFirst({
    where: { id: eventId, userId },
    select: { id: true, _count: { select: { lines: true } } },
  });
  if (!existing) return { ok: false };
  await db.event.delete({ where: { id: existing.id } });
  return { ok: true, detachedLineCount: existing._count.lines };
}

/**
 * Cierra un evento. Si `mode = LUMP_SUM` y se pasa `attributionMonth`,
 * mueve todas las líneas al `MonthRecord` correspondiente (creándolo si
 * no existía). Si `mode = BY_DATE`, las líneas quedan en su mes real.
 */
export async function closeEvent(args: {
  userId: string;
  eventId: string;
  mode: EventAttributionMode;
  attributionMonth?: string | null;
}): Promise<EventPayload | null> {
  const event = await db.event.findFirst({
    where: { id: args.eventId, userId: args.userId },
    select: { id: true, status: true },
  });
  if (!event) return null;
  if (event.status === EventStatus.CLOSED) {
    throw new Error("EVENT_ALREADY_CLOSED");
  }

  const targetMonthStart =
    args.mode === EventAttributionMode.LUMP_SUM && args.attributionMonth
      ? toMonthStart(parseMonthKey(args.attributionMonth))
      : null;

  if (args.mode === EventAttributionMode.LUMP_SUM && !targetMonthStart) {
    throw new Error("EVENT_MISSING_ATTRIBUTION_MONTH");
  }

  const yearsTouched = new Set<number>();

  await db.$transaction(async (tx) => {
    let attributionMonthId: string | null = null;

    if (targetMonthStart) {
      const targetRecord = await tx.monthRecord.upsert({
        where: {
          userId_month: { userId: args.userId, month: targetMonthStart },
        },
        update: {},
        create: {
          userId: args.userId,
          month: targetMonthStart,
          income: new Prisma.Decimal(0),
        },
        select: { id: true },
      });
      attributionMonthId = targetRecord.id;
      yearsTouched.add(targetMonthStart.getUTCFullYear());

      const lines = await tx.monthExpenseLine.findMany({
        where: { eventId: event.id, userId: args.userId },
        select: { id: true, monthRecordId: true, monthRecord: { select: { month: true } } },
      });
      for (const line of lines) {
        yearsTouched.add(line.monthRecord.month.getUTCFullYear());
      }
      const lineIds = lines.map((l) => l.id);
      if (lineIds.length > 0) {
        await tx.monthExpenseLine.updateMany({
          where: { id: { in: lineIds }, userId: args.userId },
          data: { monthRecordId: attributionMonthId },
        });
      }
    }

    await tx.event.update({
      where: { id: event.id },
      data: {
        status: EventStatus.CLOSED,
        attributionMode: args.mode,
        attributionMonthId,
        closedAt: new Date(),
      },
    });
  });

  for (const year of yearsTouched) {
    await expireYearTimeline(args.userId, year);
  }

  return getEvent(args.userId, args.eventId);
}

/**
 * Reabre un evento cerrado: devuelve cada línea al `MonthRecord` que
 * corresponde a su `occurredOn` (creando el mes destino si no existe).
 */
export async function reopenEvent(args: {
  userId: string;
  eventId: string;
}): Promise<EventPayload | null> {
  const event = await db.event.findFirst({
    where: { id: args.eventId, userId: args.userId },
    select: { id: true, status: true, attributionMode: true },
  });
  if (!event) return null;
  if (event.status !== EventStatus.CLOSED) {
    throw new Error("EVENT_NOT_CLOSED");
  }

  const yearsTouched = new Set<number>();

  await db.$transaction(async (tx) => {
    if (event.attributionMode === EventAttributionMode.LUMP_SUM) {
      const lines = await tx.monthExpenseLine.findMany({
        where: { eventId: event.id, userId: args.userId },
        select: {
          id: true,
          occurredOn: true,
          monthRecordId: true,
          monthRecord: { select: { month: true } },
        },
      });
      for (const line of lines) {
        const currentMonthStart = toMonthStart(line.monthRecord.month);
        const targetStart = toMonthStart(line.occurredOn);
        yearsTouched.add(currentMonthStart.getUTCFullYear());
        yearsTouched.add(targetStart.getUTCFullYear());
        if (currentMonthStart.getTime() === targetStart.getTime()) {
          continue;
        }
        const targetRecord = await tx.monthRecord.upsert({
          where: {
            userId_month: { userId: args.userId, month: targetStart },
          },
          update: {},
          create: {
            userId: args.userId,
            month: targetStart,
            income: new Prisma.Decimal(0),
          },
          select: { id: true },
        });
        if (targetRecord.id !== line.monthRecordId) {
          await tx.monthExpenseLine.update({
            where: { id: line.id },
            data: { monthRecordId: targetRecord.id },
          });
        }
      }
    }

    await tx.event.update({
      where: { id: event.id },
      data: {
        status: EventStatus.OPEN,
        attributionMonthId: null,
        closedAt: null,
      },
    });
  });

  for (const year of yearsTouched) {
    await expireYearTimeline(args.userId, year);
  }

  return getEvent(args.userId, args.eventId);
}

export async function getEvent(
  userId: string,
  eventId: string,
): Promise<EventPayload | null> {
  const event = await db.event.findFirst({
    where: { id: eventId, userId },
    include: {
      attributionMonth: { select: { month: true } },
      lines: { select: { amountConverted: true } },
      _count: { select: { lines: true } },
    },
  });
  if (!event) return null;
  return toEventPayload(event);
}

export async function listEvents(
  userId: string,
  options: { status?: EventStatus } = {},
): Promise<EventPayload[]> {
  const events = await db.event.findMany({
    where: {
      userId,
      ...(options.status ? { status: options.status } : {}),
    },
    include: {
      attributionMonth: { select: { month: true } },
      lines: { select: { amountConverted: true } },
      _count: { select: { lines: true } },
    },
    orderBy: [
      { status: "asc" }, // OPEN before CLOSED (alphabetical works: OPEN < CLOSED is false; manually ensure)
      { startDate: "desc" },
    ],
  });
  // Re-sort: OPEN first (we want active events on top), then by recency.
  events.sort((a, b) => {
    if (a.status === b.status) {
      return b.startDate.getTime() - a.startDate.getTime();
    }
    return a.status === EventStatus.OPEN ? -1 : 1;
  });
  return events.map(toEventPayload);
}

/**
 * Eventos `OPEN` cuyo rango `[startDate, endDate ?? +∞]` contiene `date`.
 * Lo usa la IA y el endpoint de creación de gastos para auto-tagging.
 */
export async function getActiveEventsAt(
  userId: string,
  date: Date,
): Promise<EventPayload[]> {
  const events = await db.event.findMany({
    where: {
      userId,
      status: EventStatus.OPEN,
      startDate: { lte: date },
      OR: [{ endDate: null }, { endDate: { gte: date } }],
    },
    include: {
      attributionMonth: { select: { month: true } },
      lines: { select: { amountConverted: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { startDate: "desc" },
  });
  return events.map(toEventPayload);
}

/**
 * Verifica si una fecha cae dentro del rango de un evento. Útil para que la
 * IA decida si pedir confirmación antes de etiquetar.
 */
export function isDateInEventRange(
  event: { startDate: Date; endDate: Date | null },
  date: Date,
): boolean {
  if (date < event.startDate) return false;
  if (event.endDate && date > event.endDate) return false;
  return true;
}

export async function attachLineToEvent(args: {
  userId: string;
  eventId: string;
  lineId: string;
}): Promise<{ ok: boolean; outOfRange?: boolean }> {
  const [event, line] = await Promise.all([
    db.event.findFirst({
      where: { id: args.eventId, userId: args.userId },
      select: { id: true, status: true, startDate: true, endDate: true },
    }),
    db.monthExpenseLine.findFirst({
      where: { id: args.lineId, userId: args.userId },
      select: { id: true, occurredOn: true },
    }),
  ]);
  if (!event || !line) return { ok: false };
  if (event.status !== EventStatus.OPEN) {
    throw new Error("EVENT_CLOSED");
  }
  const outOfRange = !isDateInEventRange(event, line.occurredOn);
  await db.monthExpenseLine.update({
    where: { id: line.id },
    data: { eventId: event.id },
  });
  return { ok: true, outOfRange };
}

export async function detachLineFromEvent(args: {
  userId: string;
  lineId: string;
}): Promise<{ ok: boolean }> {
  const line = await db.monthExpenseLine.findFirst({
    where: { id: args.lineId, userId: args.userId },
    select: { id: true, eventId: true },
  });
  if (!line) return { ok: false };
  if (line.eventId === null) return { ok: true };
  await db.monthExpenseLine.update({
    where: { id: line.id },
    data: { eventId: null },
  });
  return { ok: true };
}

function normalizeColor(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}
