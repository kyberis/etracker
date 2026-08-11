import {
  EventAttributionMode,
  EventParticipantRole,
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
  /** The event creator (owner). Lines always live in this user's books;
   * shared-event participants can read and contribute via the
   * `EventParticipant` join table. */
  userId: string;
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
    userId: event.userId,
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
  // Single transaction: event + OWNER participant. Every event must have an
  // OWNER row from day one so authorization checks (`isEventParticipant` /
  // `isEventOwner`) and the settlement engine can treat all events
  // uniformly. The owner's `displayName` snapshot mirrors the backfill
  // migration: name if set, else email local-part.
  const owner = await db.user.findUnique({
    where: { id: input.userId },
    select: { name: true, email: true },
  });
  const ownerDisplayName = pickOwnerDisplayName(owner);

  const created = await db.$transaction(async (tx) => {
    const event = await tx.event.create({
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
    await tx.eventParticipant.create({
      data: {
        eventId: event.id,
        userId: input.userId,
        role: EventParticipantRole.OWNER,
        displayName: ownerDisplayName,
      },
    });
    return event;
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
  // Visibility: owner OR active participant. We use a single query with
  // an OR over the join so guests landing via the share-link can see the
  // event in the same way a regular user can.
  const event = await db.event.findFirst({
    where: {
      id: eventId,
      OR: [
        { userId },
        { participants: { some: { userId, removedAt: null } } },
      ],
    },
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
  // Include events the user owns OR is an active participant of.
  // Guests created via share-link see only the trip they were invited to;
  // regular users see their own + every shared trip they accepted.
  const events = await db.event.findMany({
    where: {
      OR: [
        { userId },
        { participants: { some: { userId, removedAt: null } } },
      ],
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
  /**
   * Required to attach a line whose `occurredOn` falls outside the event's
   * [startDate, endDate]. Default false — expenses outside the trip stay
   * standalone unless the user (or UI) explicitly opts in.
   */
  allowOutOfRange?: boolean;
}): Promise<{
  ok: boolean;
  outOfRange?: boolean;
  /** True when the attach was refused because the date is outside the range. */
  needsConfirmation?: boolean;
}> {
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
  if (outOfRange && !args.allowOutOfRange) {
    return { ok: false, outOfRange: true, needsConfirmation: true };
  }
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

function pickOwnerDisplayName(
  user: { name: string | null; email: string } | null,
): string {
  if (!user) return "Owner";
  if (user.name && user.name.trim().length > 0) return user.name.trim();
  // Fallback to the email local-part so the chat message reads naturally
  // ("marcos te invitó a Mendoza Trip") instead of leaking the full address.
  const local = user.email.split("@")[0];
  return local || user.email;
}

// ---------------------------------------------------------------------------
// Participant management (shared event wallets)
// ---------------------------------------------------------------------------

export type ParticipantPayload = {
  userId: string;
  role: EventParticipantRole;
  displayName: string;
  joinedAt: string;
  removedAt: string | null;
  /** Convenience flag: did this participant link Telegram already? */
  telegramLinked: boolean;
  /** Discriminator so the UI can show "Guest" pills next to GUEST users. */
  userKind: "REGULAR" | "GUEST";
};

/**
 * Returns true when `userId` is the OWNER of `eventId`. Single source of
 * truth for "can this user mint share-tokens / remove participants /
 * delete the event".
 */
export async function isEventOwner(args: {
  userId: string;
  eventId: string;
}): Promise<boolean> {
  const ev = await db.event.findUnique({
    where: { id: args.eventId },
    select: { userId: true },
  });
  return Boolean(ev && ev.userId === args.userId);
}

/**
 * Returns true when `userId` is the OWNER OR an active GUEST participant
 * of `eventId`. Used by the routes that allow any participant to act
 * (read, attach lines, etc.).
 */
export async function isEventParticipant(args: {
  userId: string;
  eventId: string;
}): Promise<boolean> {
  const event = await db.event.findFirst({
    where: {
      id: args.eventId,
      OR: [
        { userId: args.userId },
        { participants: { some: { userId: args.userId, removedAt: null } } },
      ],
    },
    select: { id: true },
  });
  return Boolean(event);
}

/**
 * List all active participants of an event. Caller must already be
 * authorized (owner or participant); we don't re-check here so callers
 * can compose us with whatever auth flow they already ran.
 */
export async function listParticipants(args: {
  eventId: string;
}): Promise<ParticipantPayload[]> {
  const rows = await db.eventParticipant.findMany({
    where: { eventId: args.eventId, removedAt: null },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }], // OWNER first, then by join time.
    select: {
      userId: true,
      role: true,
      displayName: true,
      joinedAt: true,
      removedAt: true,
      user: {
        select: { kind: true, telegramVerifiedAt: true },
      },
    },
  });
  return rows.map((r) => ({
    userId: r.userId,
    role: r.role,
    displayName: r.displayName,
    joinedAt: r.joinedAt.toISOString(),
    removedAt: r.removedAt ? r.removedAt.toISOString() : null,
    telegramLinked: Boolean(r.user.telegramVerifiedAt),
    userKind: r.user.kind,
  }));
}

export type AddParticipantInput = {
  eventId: string;
  userId: string;
  /** Defaults to GUEST. Pass OWNER only from `createEvent` (we don't
   * support "transferring ownership" yet). */
  role?: EventParticipantRole;
  /** Snapshot. We do NOT auto-update this when User.name changes. */
  displayName: string;
  /** Optional one-time Telegram link code (only for GUEST users). */
  telegramLinkCode?: string | null;
};

/**
 * Idempotent: adding the same (eventId, userId) twice just resurrects an
 * existing tombstoned row (clears `removedAt` and refreshes
 * `displayName`). The unique constraint enforces single-row-per-pair.
 */
export async function addParticipant(
  input: AddParticipantInput,
): Promise<ParticipantPayload> {
  const role = input.role ?? EventParticipantRole.GUEST;
  const row = await db.eventParticipant.upsert({
    where: {
      eventId_userId: { eventId: input.eventId, userId: input.userId },
    },
    create: {
      eventId: input.eventId,
      userId: input.userId,
      role,
      displayName: input.displayName,
      telegramLinkCode: input.telegramLinkCode ?? null,
    },
    update: {
      removedAt: null,
      displayName: input.displayName,
      // Only overwrite the link code if a fresh one was passed in. Otherwise
      // a re-accept would clobber a still-pending one (but in practice the
      // landing only mints a code for brand-new GUEST users).
      ...(input.telegramLinkCode !== undefined
        ? { telegramLinkCode: input.telegramLinkCode }
        : {}),
    },
    select: {
      userId: true,
      role: true,
      displayName: true,
      joinedAt: true,
      removedAt: true,
      user: { select: { kind: true, telegramVerifiedAt: true } },
    },
  });
  return {
    userId: row.userId,
    role: row.role,
    displayName: row.displayName,
    joinedAt: row.joinedAt.toISOString(),
    removedAt: row.removedAt ? row.removedAt.toISOString() : null,
    telegramLinked: Boolean(row.user.telegramVerifiedAt),
    userKind: row.user.kind,
  };
}

/**
 * Soft-remove a participant. Refuses to remove the OWNER (transferring
 * ownership is unsupported and the OWNER row is required by the
 * settlement engine to anchor the event userId). Idempotent.
 */
export async function removeParticipant(args: {
  eventId: string;
  /** The user being removed. */
  userId: string;
  /** The user doing the removal. Must be the OWNER. */
  callerUserId: string;
}): Promise<{ ok: true } | { ok: false; reason: "forbidden" | "not_found" | "cannot_remove_owner" }> {
  const event = await db.event.findUnique({
    where: { id: args.eventId },
    select: { userId: true },
  });
  if (!event) return { ok: false, reason: "not_found" };
  if (event.userId !== args.callerUserId) {
    return { ok: false, reason: "forbidden" };
  }
  if (args.userId === event.userId) {
    return { ok: false, reason: "cannot_remove_owner" };
  }
  const row = await db.eventParticipant.findUnique({
    where: { eventId_userId: { eventId: args.eventId, userId: args.userId } },
    select: { id: true, removedAt: true },
  });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.removedAt) return { ok: true };
  await db.eventParticipant.update({
    where: { id: row.id },
    data: { removedAt: new Date() },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Settlement (equal-share split)
// ---------------------------------------------------------------------------

export type SettlementParticipant = {
  userId: string;
  displayName: string;
  /** What this participant actually paid (sum of MonthExpenseLine.amountConverted). */
  paid: number;
  /** Net = paid − fairShare. Positive = creditor, negative = debtor. */
  balance: number;
};

export type SettlementTransfer = {
  fromUserId: string;
  fromDisplayName: string;
  toUserId: string;
  toDisplayName: string;
  amount: number;
};

export type SettlementBreakdown = {
  eventId: string;
  /** Currency that all amounts are denominated in (= owner's primary). */
  currency: string;
  /** Total spent across all lines (in `currency`). */
  total: number;
  /** Equal share per active participant. */
  fairShare: number;
  participants: SettlementParticipant[];
  transfers: SettlementTransfer[];
};

/**
 * Compute the equal-share settlement for an event.
 *
 * Math (everything in cents to avoid floating-point drift):
 *   1. paidByUserCents[userId] = SUM(amountConverted * 100) per paidByUserId
 *      (lines without paidByUserId fall back to the event owner — this is
 *      the legacy/single-owner case and matches what the UI already shows).
 *   2. totalCents = SUM(paidByUserCents[*])
 *   3. fairShareCents = floor(totalCents / N), with the remainder absorbed
 *      by the owner so debtors never owe a fractional cent.
 *   4. netCents[userId] = paid − fairShare. Greedy match positives with
 *      negatives until both sides are zero.
 *
 * Currency assumption: `MonthExpenseLine.amountConverted` is already in
 * `User.primaryCurrency` of the EVENT OWNER, so we don't need to do any
 * cross-FX work here. The owner's currency is the settlement currency.
 *
 * Returns `null` if the event has zero active participants (defensive —
 * shouldn't happen because the OWNER row is always present).
 */
export async function computeSettlement(
  eventId: string,
): Promise<SettlementBreakdown | null> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      userId: true,
      participants: {
        where: { removedAt: null },
        select: { userId: true, displayName: true },
      },
      user: { select: { primaryCurrency: true } },
    },
  });
  if (!event || event.participants.length === 0) return null;
  const currency = event.user?.primaryCurrency ?? "USD";

  const lines = await db.monthExpenseLine.findMany({
    where: { eventId },
    select: { amountConverted: true, paidByUserId: true },
  });

  const participantById = new Map<
    string,
    { displayName: string; paidCents: bigint }
  >();
  for (const p of event.participants) {
    participantById.set(p.userId, {
      displayName: p.displayName,
      paidCents: 0n,
    });
  }

  let totalCents = 0n;
  for (const line of lines) {
    // Decimal → cents bigint via toFixed(2) avoids the float roundtrip.
    const amountCents = decimalToCents(line.amountConverted);
    totalCents += amountCents;
    // Lines without paidByUserId attribute to the owner (legacy + most
    // common case for single-participant events). Lines whose
    // paidByUserId points to a removed participant ALSO fall back to the
    // owner so the math always closes — losing fidelity here is fine
    // because the removed participant's debts were settled at removal
    // time (or, if they weren't, the owner explicitly chose to absorb).
    const payer =
      line.paidByUserId && participantById.has(line.paidByUserId)
        ? line.paidByUserId
        : event.userId;
    const entry = participantById.get(payer);
    if (entry) entry.paidCents += amountCents;
  }

  const N = BigInt(event.participants.length);
  if (N === 0n) return null;
  const fairShareCents = totalCents / N;
  const remainderCents = totalCents - fairShareCents * N;

  const participants: SettlementParticipant[] = [];
  const netCents = new Map<string, bigint>();
  for (const p of event.participants) {
    const entry = participantById.get(p.userId);
    const paidCents = entry?.paidCents ?? 0n;
    // Owner absorbs the remainder so debtor amounts always round cleanly.
    const myShareCents = fairShareCents + (p.userId === event.userId ? remainderCents : 0n);
    const balanceCents = paidCents - myShareCents;
    netCents.set(p.userId, balanceCents);
    participants.push({
      userId: p.userId,
      displayName: p.displayName,
      paid: centsToNumber(paidCents),
      balance: centsToNumber(balanceCents),
    });
  }

  const transfers = greedyMatch(netCents, event.participants);

  return {
    eventId,
    currency,
    total: centsToNumber(totalCents),
    fairShare: centsToNumber(fairShareCents),
    participants,
    transfers,
  };
}

function decimalToCents(value: Prisma.Decimal): bigint {
  // toFixed(2) gives us the value rounded to 2 dp, then we strip the dot
  // and parse as BigInt. Negative amounts (refunds someday?) are
  // preserved by the sign bit.
  const fixed = value.toFixed(2);
  const negative = fixed.startsWith("-");
  const digits = (negative ? fixed.slice(1) : fixed).replace(".", "");
  const big = BigInt(digits);
  return negative ? -big : big;
}

function centsToNumber(cents: bigint): number {
  // Two-decimal currency, safe in Number range for any plausible
  // wallet (max ~9 quadrillion cents).
  return Number(cents) / 100;
}

function greedyMatch(
  netCents: Map<string, bigint>,
  participants: Array<{ userId: string; displayName: string }>,
): SettlementTransfer[] {
  const nameById = new Map<string, string>();
  for (const p of participants) nameById.set(p.userId, p.displayName);

  // Sort creditors (positive balance) descending, debtors (negative)
  // ascending, then walk both lists. Stable order means the same input
  // always produces the same transfer list (good for snapshot tests).
  const creditors = [...netCents.entries()]
    .filter(([, c]) => c > 0n)
    .sort((a, b) => (a[1] > b[1] ? -1 : a[1] < b[1] ? 1 : 0));
  const debtors = [...netCents.entries()]
    .filter(([, c]) => c < 0n)
    .sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));

  const transfers: SettlementTransfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const [debtorId, debtorCents] = debtors[i];
    const [creditorId, creditorCents] = creditors[j];
    const owedCents = -debtorCents; // positive
    const transferCents = owedCents < creditorCents ? owedCents : creditorCents;
    if (transferCents > 0n) {
      transfers.push({
        fromUserId: debtorId,
        fromDisplayName: nameById.get(debtorId) ?? "?",
        toUserId: creditorId,
        toDisplayName: nameById.get(creditorId) ?? "?",
        amount: centsToNumber(transferCents),
      });
    }
    debtors[i] = [debtorId, debtorCents + transferCents];
    creditors[j] = [creditorId, creditorCents - transferCents];
    if (debtors[i][1] === 0n) i += 1;
    if (creditors[j][1] === 0n) j += 1;
  }
  return transfers;
}
