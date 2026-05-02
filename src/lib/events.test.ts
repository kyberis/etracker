import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for event wallets (`src/lib/events.ts`).
 *
 * Strategy: in-memory mock of the Prisma client backing `event`,
 * `monthExpenseLine` and `monthRecord` tables. We exercise the lifecycle:
 *   - `closeEvent` with `LUMP_SUM` rebuckets every line atomically.
 *   - `closeEvent` with `BY_DATE` does NOT touch lines.
 *   - `reopenEvent` after LUMP_SUM moves lines back to their real-month
 *     buckets, creating any missing month bucket.
 *   - `isDateInEventRange` pure helper handles open-ended events.
 */

type EventRow = {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  startDate: Date;
  endDate: Date | null;
  status: "OPEN" | "CLOSED";
  attributionMode: "BY_DATE" | "LUMP_SUM";
  attributionMonthId: string | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type MonthRecordRow = {
  id: string;
  userId: string;
  /** First day of the month (UTC, midnight). */
  month: Date;
  income: Prisma.Decimal;
};

type LineRow = {
  id: string;
  userId: string;
  monthRecordId: string;
  occurredOn: Date;
  amountConverted: Prisma.Decimal;
  eventId: string | null;
};

const store = {
  events: new Map<string, EventRow>(),
  months: new Map<string, MonthRecordRow>(),
  lines: new Map<string, LineRow>(),
  eventSeq: 0,
  monthSeq: 0,
  lineSeq: 0,
};

function reset() {
  store.events.clear();
  store.months.clear();
  store.lines.clear();
  store.eventSeq = 0;
  store.monthSeq = 0;
  store.lineSeq = 0;
}

const lazyDb = vi.hoisted(() => ({ db: {} as Record<string, unknown> }));
vi.mock("@/lib/db", () => ({ db: lazyDb.db }));

vi.mock("@/lib/year-timeline-data", () => ({
  expireYearTimeline: vi.fn().mockResolvedValue(undefined),
}));

type Where = Record<string, unknown>;

function matchEvent(e: EventRow, where: Where): boolean {
  if ("id" in where && where.id !== e.id) return false;
  if ("userId" in where && where.userId !== e.userId) return false;
  if ("status" in where && where.status !== e.status) return false;
  return true;
}

function matchLine(l: LineRow, where: Where): boolean {
  if ("id" in where) {
    const id = where.id;
    if (typeof id === "string") {
      if (id !== l.id) return false;
    } else if (typeof id === "object" && id !== null) {
      const w = id as { in?: string[] };
      if (w.in && !w.in.includes(l.id)) return false;
    }
  }
  if ("userId" in where && where.userId !== l.userId) return false;
  if ("eventId" in where && where.eventId !== l.eventId) return false;
  if ("monthRecordId" in where && where.monthRecordId !== l.monthRecordId) {
    return false;
  }
  return true;
}

function withTimestamps<T extends object>(row: T): T & {
  createdAt: Date;
  updatedAt: Date;
} {
  const now = new Date();
  return { ...row, createdAt: now, updatedAt: now };
}

const dbClient = {
  event: {
    findFirst: vi.fn(async ({ where }: { where: Where }) => {
      for (const e of store.events.values()) {
        if (matchEvent(e, where)) return e;
      }
      return null;
    }),
    findMany: vi.fn(async ({ where }: { where: Where }) => {
      const result: EventRow[] = [];
      for (const e of store.events.values()) {
        if (matchEvent(e, where)) result.push(e);
      }
      return result;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      store.eventSeq += 1;
      const row: EventRow = withTimestamps({
        id: `event_${store.eventSeq}`,
        userId: data.userId as string,
        name: data.name as string,
        color: (data.color as string | null) ?? null,
        startDate: data.startDate as Date,
        endDate: (data.endDate as Date | null) ?? null,
        status: "OPEN",
        attributionMode:
          (data.attributionMode as "BY_DATE" | "LUMP_SUM" | undefined) ??
          "LUMP_SUM",
        attributionMonthId: null,
        closedAt: null,
      } as EventRow);
      store.events.set(row.id, row);
      return row;
    }),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = store.events.get(where.id);
        if (!row) throw new Error("Event not found");
        for (const [k, v] of Object.entries(data)) {
          (row as Record<string, unknown>)[k] = v;
        }
        row.updatedAt = new Date();
        return row;
      },
    ),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      store.events.delete(where.id);
      return { id: where.id };
    }),
  },
  monthRecord: {
    upsert: vi.fn(
      async ({
        where,
        create,
      }: {
        where: { userId_month: { userId: string; month: Date } };
        update: Record<string, unknown>;
        create: Record<string, unknown>;
        select?: Record<string, true>;
      }) => {
        const key = `${where.userId_month.userId}|${where.userId_month.month.toISOString()}`;
        for (const m of store.months.values()) {
          if (
            m.userId === where.userId_month.userId &&
            m.month.getTime() === where.userId_month.month.getTime()
          ) {
            return { id: m.id };
          }
        }
        store.monthSeq += 1;
        const row: MonthRecordRow = {
          id: `month_${store.monthSeq}`,
          userId: create.userId as string,
          month: create.month as Date,
          income: create.income as Prisma.Decimal,
        };
        store.months.set(key, row);
        return { id: row.id };
      },
    ),
  },
  monthExpenseLine: {
    findMany: vi.fn(
      async ({
        where,
        select,
      }: {
        where: Where;
        select?: Record<string, true | Record<string, unknown>>;
      }) => {
        const rows: Array<Record<string, unknown>> = [];
        for (const l of store.lines.values()) {
          if (!matchLine(l, where)) continue;
          const monthRow = [...store.months.values()].find(
            (m) => m.id === l.monthRecordId,
          );
          const out: Record<string, unknown> = { ...l };
          if (select?.monthRecord) {
            out.monthRecord = { month: monthRow?.month ?? new Date(0) };
          }
          rows.push(out);
        }
        return rows;
      },
    ),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: Where;
        data: Record<string, unknown>;
      }) => {
        let count = 0;
        for (const l of store.lines.values()) {
          if (!matchLine(l, where)) continue;
          for (const [k, v] of Object.entries(data)) {
            (l as Record<string, unknown>)[k] = v;
          }
          count += 1;
        }
        return { count };
      },
    ),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = store.lines.get(where.id);
        if (!row) throw new Error("Line not found");
        for (const [k, v] of Object.entries(data)) {
          (row as Record<string, unknown>)[k] = v;
        }
        return row;
      },
    ),
  },
  $transaction: vi.fn(async (fn: (tx: typeof dbClient) => Promise<unknown>) => {
    return fn(dbClient);
  }),
};

beforeEach(() => {
  reset();
  Object.assign(lazyDb.db, dbClient);
});

afterEach(() => {
  vi.clearAllMocks();
});

// Helpers ─────────────────────────────────────────────────────────────────────

function utcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function seedMonth(userId: string, monthIso: string): MonthRecordRow {
  const month = utcDate(monthIso);
  store.monthSeq += 1;
  const row: MonthRecordRow = {
    id: `month_${store.monthSeq}`,
    userId,
    month,
    income: new Prisma.Decimal(0),
  };
  store.months.set(`${userId}|${month.toISOString()}`, row);
  return row;
}

function seedLine(args: {
  userId: string;
  monthRecordId: string;
  occurredOn: string;
  amountConverted: number;
  eventId?: string | null;
}): LineRow {
  store.lineSeq += 1;
  const row: LineRow = {
    id: `line_${store.lineSeq}`,
    userId: args.userId,
    monthRecordId: args.monthRecordId,
    occurredOn: utcDate(args.occurredOn),
    amountConverted: new Prisma.Decimal(args.amountConverted),
    eventId: args.eventId ?? null,
  };
  store.lines.set(row.id, row);
  return row;
}

// Now import the module under test (after the mocks are wired).
import {
  closeEvent,
  createEvent,
  isDateInEventRange,
  reopenEvent,
} from "@/lib/events";

const USER = "user_1";

describe("isDateInEventRange", () => {
  it("returns true when the date is inside [start, end]", () => {
    expect(
      isDateInEventRange(
        { startDate: utcDate("2026-04-01"), endDate: utcDate("2026-04-10") },
        utcDate("2026-04-05"),
      ),
    ).toBe(true);
  });

  it("returns false when the date is before start", () => {
    expect(
      isDateInEventRange(
        { startDate: utcDate("2026-04-01"), endDate: utcDate("2026-04-10") },
        utcDate("2026-03-31"),
      ),
    ).toBe(false);
  });

  it("returns false when the date is after end", () => {
    expect(
      isDateInEventRange(
        { startDate: utcDate("2026-04-01"), endDate: utcDate("2026-04-10") },
        utcDate("2026-04-11"),
      ),
    ).toBe(false);
  });

  it("treats endDate=null as +infinity", () => {
    expect(
      isDateInEventRange(
        { startDate: utcDate("2026-04-01"), endDate: null },
        utcDate("2030-01-01"),
      ),
    ).toBe(true);
  });
});

describe("closeEvent — LUMP_SUM rebuckets every line atomically", () => {
  it("moves all lines from their original months to the attribution month", async () => {
    const aprilRecord = seedMonth(USER, "2026-04-01");
    const mayRecord = seedMonth(USER, "2026-05-01");
    const event = await createEvent({
      userId: USER,
      name: "Trip",
      startDate: utcDate("2026-04-15"),
      endDate: utcDate("2026-05-05"),
    });
    const line1 = seedLine({
      userId: USER,
      monthRecordId: aprilRecord.id,
      occurredOn: "2026-04-20",
      amountConverted: 100,
      eventId: event.id,
    });
    const line2 = seedLine({
      userId: USER,
      monthRecordId: mayRecord.id,
      occurredOn: "2026-05-02",
      amountConverted: 250,
      eventId: event.id,
    });

    const closed = await closeEvent({
      userId: USER,
      eventId: event.id,
      mode: "LUMP_SUM",
      attributionMonth: "2026-04",
    });

    expect(closed?.status).toBe("CLOSED");
    expect(closed?.attributionMode).toBe("LUMP_SUM");
    expect(store.lines.get(line1.id)?.monthRecordId).toBe(aprilRecord.id);
    expect(store.lines.get(line2.id)?.monthRecordId).toBe(aprilRecord.id);
  });

  it("rejects LUMP_SUM without attributionMonth", async () => {
    const event = await createEvent({
      userId: USER,
      name: "Trip",
      startDate: utcDate("2026-04-15"),
      endDate: null,
    });

    await expect(
      closeEvent({
        userId: USER,
        eventId: event.id,
        mode: "LUMP_SUM",
      }),
    ).rejects.toThrow("EVENT_MISSING_ATTRIBUTION_MONTH");
  });
});

describe("closeEvent — BY_DATE leaves lines in their real-month buckets", () => {
  it("does not move any line", async () => {
    const aprilRecord = seedMonth(USER, "2026-04-01");
    const mayRecord = seedMonth(USER, "2026-05-01");
    const event = await createEvent({
      userId: USER,
      name: "Trip",
      startDate: utcDate("2026-04-15"),
      endDate: utcDate("2026-05-05"),
    });
    const line1 = seedLine({
      userId: USER,
      monthRecordId: aprilRecord.id,
      occurredOn: "2026-04-20",
      amountConverted: 100,
      eventId: event.id,
    });
    const line2 = seedLine({
      userId: USER,
      monthRecordId: mayRecord.id,
      occurredOn: "2026-05-02",
      amountConverted: 250,
      eventId: event.id,
    });

    const closed = await closeEvent({
      userId: USER,
      eventId: event.id,
      mode: "BY_DATE",
    });

    expect(closed?.status).toBe("CLOSED");
    expect(closed?.attributionMode).toBe("BY_DATE");
    expect(closed?.attributionMonth).toBeNull();
    expect(store.lines.get(line1.id)?.monthRecordId).toBe(aprilRecord.id);
    expect(store.lines.get(line2.id)?.monthRecordId).toBe(mayRecord.id);
  });
});

describe("reopenEvent — reverts a LUMP_SUM close", () => {
  it("moves each line back to the month bucket of its occurredOn", async () => {
    const aprilRecord = seedMonth(USER, "2026-04-01");
    const mayRecord = seedMonth(USER, "2026-05-01");
    const event = await createEvent({
      userId: USER,
      name: "Trip",
      startDate: utcDate("2026-04-15"),
      endDate: utcDate("2026-05-05"),
    });
    const line1 = seedLine({
      userId: USER,
      monthRecordId: aprilRecord.id,
      occurredOn: "2026-04-20",
      amountConverted: 100,
      eventId: event.id,
    });
    const line2 = seedLine({
      userId: USER,
      monthRecordId: mayRecord.id,
      occurredOn: "2026-05-02",
      amountConverted: 250,
      eventId: event.id,
    });

    await closeEvent({
      userId: USER,
      eventId: event.id,
      mode: "LUMP_SUM",
      attributionMonth: "2026-04",
    });
    expect(store.lines.get(line2.id)?.monthRecordId).toBe(aprilRecord.id);

    const reopened = await reopenEvent({ userId: USER, eventId: event.id });
    expect(reopened?.status).toBe("OPEN");
    expect(reopened?.attributionMonth).toBeNull();
    expect(store.lines.get(line1.id)?.monthRecordId).toBe(aprilRecord.id);
    expect(store.lines.get(line2.id)?.monthRecordId).toBe(mayRecord.id);
  });
});
