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
  paidByUserId: string | null;
};

type ParticipantRow = {
  id: string;
  eventId: string;
  userId: string;
  role: "OWNER" | "GUEST";
  displayName: string;
  joinedAt: Date;
  removedAt: Date | null;
};

type UserRow = {
  id: string;
  name: string | null;
  email: string;
  primaryCurrency: string;
};

const store = {
  events: new Map<string, EventRow>(),
  months: new Map<string, MonthRecordRow>(),
  lines: new Map<string, LineRow>(),
  participants: new Map<string, ParticipantRow>(),
  users: new Map<string, UserRow>(),
  eventSeq: 0,
  monthSeq: 0,
  lineSeq: 0,
  participantSeq: 0,
};

function reset() {
  store.events.clear();
  store.months.clear();
  store.lines.clear();
  store.participants.clear();
  store.users.clear();
  store.eventSeq = 0;
  store.monthSeq = 0;
  store.lineSeq = 0;
  store.participantSeq = 0;
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
    findUnique: vi.fn(
      async ({
        where,
      }: {
        where: { id: string };
        select?: Record<string, unknown>;
      }) => {
        const e = store.events.get(where.id);
        if (!e) return null;
        // The settlement query needs `participants` and `user`. We
        // enrich on demand to keep the mock minimal — production
        // Prisma applies the `select` filter, but the engine ignores
        // unrequested fields so this is benign.
        const participants = [...store.participants.values()]
          .filter((p) => p.eventId === e.id && p.removedAt === null)
          .map((p) => ({ userId: p.userId, displayName: p.displayName }));
        const user = store.users.get(e.userId);
        return {
          ...e,
          participants,
          user: user
            ? { primaryCurrency: user.primaryCurrency }
            : { primaryCurrency: "USD" },
        };
      },
    ),
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
  user: {
    findUnique: vi.fn(
      async ({ where }: { where: { id: string } }) => {
        return store.users.get(where.id) ?? null;
      },
    ),
  },
  eventParticipant: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      store.participantSeq += 1;
      const row: ParticipantRow = {
        id: `participant_${store.participantSeq}`,
        eventId: data.eventId as string,
        userId: data.userId as string,
        role: data.role as "OWNER" | "GUEST",
        displayName: data.displayName as string,
        joinedAt: new Date(),
        removedAt: null,
      };
      store.participants.set(row.id, row);
      return row;
    }),
  },
  $transaction: vi.fn(
    async (fn: (tx: typeof dbClient) => Promise<unknown>) => {
      return fn(dbClient);
    },
  ),
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
  paidByUserId?: string | null;
}): LineRow {
  store.lineSeq += 1;
  const row: LineRow = {
    id: `line_${store.lineSeq}`,
    userId: args.userId,
    monthRecordId: args.monthRecordId,
    occurredOn: utcDate(args.occurredOn),
    amountConverted: new Prisma.Decimal(args.amountConverted),
    eventId: args.eventId ?? null,
    paidByUserId: args.paidByUserId ?? null,
  };
  store.lines.set(row.id, row);
  return row;
}

function seedUser(args: {
  id: string;
  name?: string | null;
  email?: string;
  primaryCurrency?: string;
}): UserRow {
  const row: UserRow = {
    id: args.id,
    name: args.name ?? null,
    email: args.email ?? `${args.id}@example.com`,
    primaryCurrency: args.primaryCurrency ?? "USD",
  };
  store.users.set(row.id, row);
  return row;
}

function seedParticipant(args: {
  eventId: string;
  userId: string;
  role?: "OWNER" | "GUEST";
  displayName: string;
  removedAt?: Date | null;
}): ParticipantRow {
  store.participantSeq += 1;
  const row: ParticipantRow = {
    id: `participant_${store.participantSeq}`,
    eventId: args.eventId,
    userId: args.userId,
    role: args.role ?? "GUEST",
    displayName: args.displayName,
    joinedAt: new Date(),
    removedAt: args.removedAt ?? null,
  };
  store.participants.set(row.id, row);
  return row;
}

// Now import the module under test (after the mocks are wired).
import {
  closeEvent,
  computeSettlement,
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
    seedUser({ id: USER, name: "Owner", email: "owner@example.com" });
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
    seedUser({ id: USER, name: "Owner", email: "owner@example.com" });
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
    seedUser({ id: USER, name: "Owner", email: "owner@example.com" });
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
    seedUser({ id: USER, name: "Owner", email: "owner@example.com" });
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

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

/**
 * Tiny scenario builder so each test reads as a story instead of a wall
 * of seed boilerplate. Returns the eventId; callers seed lines through
 * `seedLine` directly.
 */
async function setupShared(args: {
  participants: Array<{ id: string; name: string; isOwner?: boolean }>;
  primaryCurrency?: string;
}): Promise<{ eventId: string; ownerId: string; record: MonthRecordRow }> {
  const owner = args.participants.find((p) => p.isOwner) ?? args.participants[0];
  for (const p of args.participants) {
    seedUser({
      id: p.id,
      name: p.name,
      email: `${p.id}@example.com`,
      primaryCurrency: args.primaryCurrency ?? "USD",
    });
  }
  const record = seedMonth(owner.id, "2026-04-01");
  const event = await createEvent({
    userId: owner.id,
    name: "Trip",
    startDate: utcDate("2026-04-01"),
    endDate: utcDate("2026-04-30"),
  });
  // createEvent has already created the OWNER participant via the
  // mocked transaction. Add the rest as GUESTs.
  for (const p of args.participants) {
    if (p.id === owner.id) continue;
    seedParticipant({
      eventId: event.id,
      userId: p.id,
      role: "GUEST",
      displayName: p.name,
    });
  }
  return { eventId: event.id, ownerId: owner.id, record };
}

describe("computeSettlement", () => {
  it("returns null transfers when everyone paid their fair share", async () => {
    const { eventId, ownerId, record } = await setupShared({
      participants: [
        { id: "u_owner", name: "Owner", isOwner: true },
        { id: "u_a", name: "Ana" },
        { id: "u_b", name: "Bea" },
      ],
    });
    seedLine({
      userId: ownerId,
      monthRecordId: record.id,
      occurredOn: "2026-04-10",
      amountConverted: 100,
      eventId,
      paidByUserId: "u_owner",
    });
    seedLine({
      userId: ownerId,
      monthRecordId: record.id,
      occurredOn: "2026-04-11",
      amountConverted: 100,
      eventId,
      paidByUserId: "u_a",
    });
    seedLine({
      userId: ownerId,
      monthRecordId: record.id,
      occurredOn: "2026-04-12",
      amountConverted: 100,
      eventId,
      paidByUserId: "u_b",
    });

    const s = await computeSettlement(eventId);
    expect(s).not.toBeNull();
    expect(s!.total).toBe(300);
    expect(s!.fairShare).toBe(100);
    // All three balances should be ~0 (the owner absorbs 0 cents
    // remainder because 300/3 = 100 exact).
    for (const p of s!.participants) {
      expect(p.balance).toBe(0);
    }
    expect(s!.transfers).toHaveLength(0);
  });

  it("matches debtors with creditors greedily (90/60/0 case)", async () => {
    const { eventId, ownerId, record } = await setupShared({
      participants: [
        { id: "u_owner", name: "Owner", isOwner: true },
        { id: "u_a", name: "Ana" },
        { id: "u_b", name: "Bea" },
      ],
    });
    seedLine({
      userId: ownerId,
      monthRecordId: record.id,
      occurredOn: "2026-04-10",
      amountConverted: 90,
      eventId,
      paidByUserId: "u_owner",
    });
    seedLine({
      userId: ownerId,
      monthRecordId: record.id,
      occurredOn: "2026-04-11",
      amountConverted: 60,
      eventId,
      paidByUserId: "u_a",
    });
    // u_b paid nothing.

    const s = await computeSettlement(eventId);
    expect(s).not.toBeNull();
    expect(s!.total).toBe(150);
    expect(s!.fairShare).toBe(50);
    // Owner: paid 90, owes 50 → +40 (creditor)
    // Ana:   paid 60, owes 50 → +10 (creditor)
    // Bea:   paid  0, owes 50 → -50 (debtor)
    const map = new Map(s!.participants.map((p) => [p.userId, p.balance]));
    expect(map.get("u_owner")).toBe(40);
    expect(map.get("u_a")).toBe(10);
    expect(map.get("u_b")).toBe(-50);
    // Transfers: B → owner 40, B → A 10 (owner first because larger creditor).
    expect(s!.transfers).toEqual([
      expect.objectContaining({
        fromUserId: "u_b",
        toUserId: "u_owner",
        amount: 40,
      }),
      expect.objectContaining({
        fromUserId: "u_b",
        toUserId: "u_a",
        amount: 10,
      }),
    ]);
  });

  it("absorbs the rounding remainder onto the owner so debtors are clean", async () => {
    const { eventId, ownerId, record } = await setupShared({
      participants: [
        { id: "u_owner", name: "Owner", isOwner: true },
        { id: "u_a", name: "Ana" },
        { id: "u_b", name: "Bea" },
      ],
    });
    // Single $100 paid by owner → 3 people, fair share = 33.33,
    // remainder = 1c absorbed by owner.
    seedLine({
      userId: ownerId,
      monthRecordId: record.id,
      occurredOn: "2026-04-10",
      amountConverted: 100,
      eventId,
      paidByUserId: "u_owner",
    });

    const s = await computeSettlement(eventId);
    expect(s).not.toBeNull();
    expect(s!.total).toBe(100);
    expect(s!.fairShare).toBe(33.33);
    // Owner share = 33.33 + 0.01 = 33.34, balance = 100 - 33.34 = 66.66
    // Each debtor owes a clean 33.33.
    const map = new Map(s!.participants.map((p) => [p.userId, p.balance]));
    expect(map.get("u_owner")).toBe(66.66);
    expect(map.get("u_a")).toBe(-33.33);
    expect(map.get("u_b")).toBe(-33.33);
    expect(s!.transfers).toHaveLength(2);
    for (const t of s!.transfers) {
      expect(t.amount).toBe(33.33);
      expect(t.toUserId).toBe("u_owner");
    }
    // Transfers sum to debtor obligations and to the creditor balance.
    const sum = s!.transfers.reduce((a, t) => a + t.amount, 0);
    expect(sum).toBeCloseTo(66.66, 2);
  });

  it("falls back to the owner when paidByUserId is null (legacy lines)", async () => {
    const { eventId, ownerId, record } = await setupShared({
      participants: [
        { id: "u_owner", name: "Owner", isOwner: true },
        { id: "u_a", name: "Ana" },
      ],
    });
    seedLine({
      userId: ownerId,
      monthRecordId: record.id,
      occurredOn: "2026-04-10",
      amountConverted: 200,
      eventId,
      paidByUserId: null,
    });
    const s = await computeSettlement(eventId);
    expect(s).not.toBeNull();
    expect(s!.total).toBe(200);
    expect(s!.fairShare).toBe(100);
    const map = new Map(s!.participants.map((p) => [p.userId, p.balance]));
    expect(map.get("u_owner")).toBe(100); // 200 paid, 100 owes
    expect(map.get("u_a")).toBe(-100);
    expect(s!.transfers).toEqual([
      expect.objectContaining({
        fromUserId: "u_a",
        toUserId: "u_owner",
        amount: 100,
      }),
    ]);
  });

  it("handles 4-person asymmetric split", async () => {
    const { eventId, ownerId, record } = await setupShared({
      participants: [
        { id: "u_owner", name: "Owner", isOwner: true },
        { id: "u_a", name: "Ana" },
        { id: "u_b", name: "Bea" },
        { id: "u_c", name: "Cal" },
      ],
    });
    // Total: 400. Fair share: 100.
    seedLine({
      userId: ownerId,
      monthRecordId: record.id,
      occurredOn: "2026-04-10",
      amountConverted: 200,
      eventId,
      paidByUserId: "u_owner",
    });
    seedLine({
      userId: ownerId,
      monthRecordId: record.id,
      occurredOn: "2026-04-11",
      amountConverted: 200,
      eventId,
      paidByUserId: "u_a",
    });
    const s = await computeSettlement(eventId);
    expect(s!.total).toBe(400);
    expect(s!.fairShare).toBe(100);
    // Both debtors should pay split between two creditors. Owner & Ana
    // are tied at +100; greedy stable sort keeps owner first.
    expect(s!.transfers.length).toBeGreaterThanOrEqual(2);
    // Net check: every transfer reduces debtor balance and increases
    // creditor balance equally. The sum of `from` outflows must equal
    // the sum of `to` inflows.
    const out = new Map<string, number>();
    const inn = new Map<string, number>();
    for (const t of s!.transfers) {
      out.set(t.fromUserId, (out.get(t.fromUserId) ?? 0) + t.amount);
      inn.set(t.toUserId, (inn.get(t.toUserId) ?? 0) + t.amount);
    }
    expect(out.get("u_b")).toBe(100);
    expect(out.get("u_c")).toBe(100);
    expect((inn.get("u_owner") ?? 0) + (inn.get("u_a") ?? 0)).toBe(200);
  });

  it("attributes lines paid by a removed participant to the owner", async () => {
    const { eventId, ownerId, record } = await setupShared({
      participants: [
        { id: "u_owner", name: "Owner", isOwner: true },
        { id: "u_a", name: "Ana" },
      ],
    });
    // u_b was once a participant who paid for things, then was removed.
    seedUser({ id: "u_b", name: "Bea" });
    seedParticipant({
      eventId,
      userId: "u_b",
      role: "GUEST",
      displayName: "Bea",
      removedAt: new Date(),
    });
    seedLine({
      userId: ownerId,
      monthRecordId: record.id,
      occurredOn: "2026-04-10",
      amountConverted: 100,
      eventId,
      paidByUserId: "u_b", // removed participant
    });
    seedLine({
      userId: ownerId,
      monthRecordId: record.id,
      occurredOn: "2026-04-11",
      amountConverted: 100,
      eventId,
      paidByUserId: "u_a",
    });

    const s = await computeSettlement(eventId);
    // Active participants are owner + ana (2). Bea's $100 falls back
    // to the owner. Total = $200, fair = $100.
    expect(s!.total).toBe(200);
    expect(s!.fairShare).toBe(100);
    const map = new Map(s!.participants.map((p) => [p.userId, p.balance]));
    expect(map.get("u_owner")).toBe(0); // 100 (fallback) − 100 = 0
    expect(map.get("u_a")).toBe(0); // 100 − 100 = 0
    expect(s!.transfers).toHaveLength(0);
  });
});
