import { Prisma, SavingsMovementKind } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the savings ledger service. The strategy is:
 *   - Mock `@/lib/db` with an in-memory store backing both the `user` table
 *     and the `savingsMovement` table. The cache invariant
 *     `User.savings === SUM(SavingsMovement.amount)` is enforced and asserted
 *     after each flow so the production rule has a real test.
 *   - Drive every public service from `src/lib/savings.ts` through realistic
 *     scenarios (manual deposits/withdrawals, monthly contribution upsert,
 *     debt coverage edge cases, recompute drift).
 */

type MovementRow = {
  id: string;
  userId: string;
  monthRecordId: string | null;
  kind: SavingsMovementKind;
  amount: Prisma.Decimal;
  currency: string;
  note: string | null;
  occurredOn: Date;
  createdAt: Date;
  updatedAt: Date;
};

type UserRow = {
  id: string;
  savings: Prisma.Decimal;
  primaryCurrency: string;
};

type AnyArgs = Record<string, unknown>;

const store = {
  users: new Map<string, UserRow>(),
  movements: [] as MovementRow[],
  movementSeq: 0,
};

function nextId() {
  store.movementSeq += 1;
  return `mv_${store.movementSeq}`;
}

function reset() {
  store.users.clear();
  store.movements.length = 0;
  store.movementSeq = 0;
}

function ensureUser(id: string, primaryCurrency = "EUR") {
  if (!store.users.has(id)) {
    store.users.set(id, {
      id,
      savings: new Prisma.Decimal(0),
      primaryCurrency,
    });
  }
  return store.users.get(id)!;
}

function pickFields<T extends object>(
  source: T,
  select: Record<string, true>,
): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(select)) {
    (out as Record<string, unknown>)[k] = (source as Record<string, unknown>)[k];
  }
  return out;
}

const lazyDb = vi.hoisted(() => ({ db: {} as Record<string, unknown> }));
vi.mock("@/lib/db", () => ({ db: lazyDb.db }));

const dbClient = {
  savingsMovement: {
    create: async ({ data }: { data: AnyArgs }) => {
      const row: MovementRow = {
        id: nextId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: data.userId as string,
        monthRecordId: (data.monthRecordId as string | null | undefined) ?? null,
        kind: data.kind as SavingsMovementKind,
        amount: new Prisma.Decimal(
          data.amount as Prisma.Decimal | string | number,
        ),
        currency: data.currency as string,
        note: (data.note as string | null | undefined) ?? null,
        occurredOn: (data.occurredOn as Date | undefined) ?? new Date(),
      };
      store.movements.push(row);
      return row;
    },
    findFirst: async ({
      where,
      select,
    }: {
      where: AnyArgs;
      select?: Record<string, true>;
    }) => {
      const found = store.movements.find((m) => {
        if (where.userId && m.userId !== where.userId) return false;
        if (where.id && m.id !== where.id) return false;
        if (Object.prototype.hasOwnProperty.call(where, "monthRecordId")) {
          if (m.monthRecordId !== where.monthRecordId) return false;
        }
        if (where.kind && m.kind !== where.kind) return false;
        return true;
      });
      if (!found) return null;
      return select ? pickFields(found, select) : found;
    },
    findMany: async ({
      where,
      take,
      include,
      orderBy,
      select,
    }: {
      where?: AnyArgs;
      take?: number;
      include?: { monthRecord?: unknown };
      orderBy?: unknown;
      select?: Record<string, true>;
    }) => {
      let rows = store.movements.filter((m) => {
        if (where?.userId && m.userId !== where.userId) return false;
        const idClause = where?.id as
          | string
          | { in?: string[] }
          | undefined;
        if (idClause) {
          if (typeof idClause === "string") {
            if (m.id !== idClause) return false;
          } else if (idClause.in && !idClause.in.includes(m.id)) {
            return false;
          }
        }
        const kindClause = where?.kind as
          | SavingsMovementKind
          | { in?: SavingsMovementKind[] }
          | undefined;
        if (kindClause) {
          if (typeof kindClause === "string") {
            if (m.kind !== kindClause) return false;
          } else if (kindClause.in && !kindClause.in.includes(m.kind)) {
            return false;
          }
        }
        return true;
      });
      if (orderBy) {
        const orderArr = Array.isArray(orderBy) ? orderBy : [orderBy];
        const isCreatedAtSort = orderArr.some(
          (o) => o && typeof o === "object" && "createdAt" in (o as object),
        );
        rows = [...rows].sort((a, b) => {
          if (isCreatedAtSort) {
            const t = a.createdAt.getTime() - b.createdAt.getTime();
            if (t !== 0) return t;
            return a.id.localeCompare(b.id);
          }
          return b.occurredOn.getTime() - a.occurredOn.getTime();
        });
      }
      if (take) rows = rows.slice(0, take);
      if (include?.monthRecord) {
        return rows.map((m) => ({
          ...m,
          monthRecord: m.monthRecordId
            ? { month: new Date(Date.UTC(2026, 4, 1)) }
            : null,
        }));
      }
      if (select) return rows.map((m) => pickFields(m, select));
      return rows;
    },
    deleteMany: async ({ where }: { where: AnyArgs }) => {
      const idClause = where?.id as
        | string
        | { in?: string[] }
        | undefined;
      const userId = where?.userId as string | undefined;
      const ids = new Set<string>();
      if (idClause && typeof idClause === "object" && idClause.in) {
        for (const id of idClause.in) ids.add(id);
      } else if (typeof idClause === "string") {
        ids.add(idClause);
      }
      let count = 0;
      for (let i = store.movements.length - 1; i >= 0; i -= 1) {
        const m = store.movements[i];
        if (userId && m.userId !== userId) continue;
        if (!ids.has(m.id)) continue;
        store.movements.splice(i, 1);
        count += 1;
      }
      return { count };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const idx = store.movements.findIndex((m) => m.id === where.id);
      if (idx === -1) throw new Error("not found");
      const [removed] = store.movements.splice(idx, 1);
      return removed;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: AnyArgs;
    }) => {
      const row = store.movements.find((m) => m.id === where.id);
      if (!row) throw new Error("not found");
      if (data.amount !== undefined) {
        row.amount = new Prisma.Decimal(
          data.amount as Prisma.Decimal | string | number,
        );
      }
      if (data.note !== undefined) row.note = data.note as string | null;
      if (data.occurredOn !== undefined) row.occurredOn = data.occurredOn as Date;
      row.updatedAt = new Date();
      return row;
    },
    aggregate: async ({
      where,
      _sum,
    }: {
      where: { userId: string };
      _sum?: { amount?: true };
    }) => {
      const rows = store.movements.filter((m) => m.userId === where.userId);
      if (_sum?.amount) {
        const sum = rows.reduce(
          (acc, m) => acc.plus(m.amount),
          new Prisma.Decimal(0),
        );
        return { _sum: { amount: sum } };
      }
      return { _sum: {} };
    },
  },
  user: {
    findUnique: async ({
      where,
      select,
    }: {
      where: { id: string };
      select?: Record<string, true>;
    }) => {
      const u = store.users.get(where.id);
      if (!u) return null;
      return select ? pickFields(u, select) : u;
    },
    update: async ({
      where,
      data,
      select,
    }: {
      where: { id: string };
      data: { savings?: Prisma.Decimal | { increment?: Prisma.Decimal; decrement?: Prisma.Decimal } };
      select?: Record<string, true>;
    }) => {
      const u = store.users.get(where.id);
      if (!u) throw new Error("user not found");
      const s = data.savings;
      if (s && typeof s === "object" && "increment" in s && s.increment !== undefined) {
        u.savings = u.savings.plus(new Prisma.Decimal(s.increment));
      } else if (
        s &&
        typeof s === "object" &&
        "decrement" in s &&
        s.decrement !== undefined
      ) {
        u.savings = u.savings.minus(new Prisma.Decimal(s.decrement));
      } else if (s !== undefined && s !== null && !(typeof s === "object" && ("increment" in s || "decrement" in s))) {
        u.savings = new Prisma.Decimal(s as Prisma.Decimal | string | number);
      }
      return select ? pickFields(u, select) : u;
    },
  },
  $transaction: async (
    fn: (tx: Record<string, unknown>) => Promise<unknown>,
  ) => fn(dbClient),
};

Object.assign(lazyDb.db, dbClient);

import {
  coverMonthDebt,
  deleteManualDuplicateMovements,
  deleteSavingsMovement,
  findManualDuplicateMovements,
  getSavingsState,
  recomputeSavingsCache,
  recordSavingsMovement,
  removeMonthlySavingsContribution,
  setMonthlySavingsContribution,
  updateSavingsMovementAmount,
} from "./savings";

const USER = "user_1";
const OTHER_USER = "user_2";

function ledgerSum(userId: string) {
  return store.movements
    .filter((m) => m.userId === userId)
    .reduce((acc, m) => acc.plus(m.amount), new Prisma.Decimal(0));
}

function expectInvariant(userId: string) {
  const cached = store.users.get(userId)!.savings;
  const sum = ledgerSum(userId);
  expect(cached.toString()).toBe(sum.toString());
}

beforeEach(() => {
  reset();
  ensureUser(USER, "EUR");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("recordSavingsMovement", () => {
  it("inserts a movement and increments the cache atomically", async () => {
    const result = await recordSavingsMovement({
      userId: USER,
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: new Prisma.Decimal("100.50"),
      currency: "EUR",
    });
    expect(result.balance).toBe(100.5);
    expect(store.movements).toHaveLength(1);
    expect(store.movements[0].kind).toBe(SavingsMovementKind.MANUAL_DEPOSIT);
    expectInvariant(USER);
  });

  it("supports negative amounts (withdrawal-shape) and trims notes", async () => {
    await recordSavingsMovement({
      userId: USER,
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: new Prisma.Decimal("200"),
      currency: "EUR",
    });
    const result = await recordSavingsMovement({
      userId: USER,
      kind: SavingsMovementKind.MANUAL_WITHDRAWAL,
      amount: new Prisma.Decimal("-30"),
      currency: "EUR",
      note: "  café  ",
    });
    expect(result.balance).toBe(170);
    expect(store.movements[1].note).toBe("café");
    expectInvariant(USER);
  });
});

describe("deleteSavingsMovement", () => {
  it("removes the movement and decrements the cache by the same amount", async () => {
    const a = await recordSavingsMovement({
      userId: USER,
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: new Prisma.Decimal("50"),
      currency: "EUR",
    });
    const b = await recordSavingsMovement({
      userId: USER,
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: new Prisma.Decimal("25"),
      currency: "EUR",
    });
    expect(b.balance).toBe(75);

    const del = await deleteSavingsMovement(a.movement.id, USER);
    expect(del).toEqual({ ok: true, balance: 25 });
    expectInvariant(USER);
  });

  it("returns notFound when the id does not belong to the user", async () => {
    const result = await deleteSavingsMovement("missing", USER);
    expect(result).toEqual({ ok: false, reason: "notFound" });
  });
});

describe("updateSavingsMovementAmount", () => {
  it("re-syncs the cache by delta when the amount changes", async () => {
    const created = await recordSavingsMovement({
      userId: USER,
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: new Prisma.Decimal("80"),
      currency: "EUR",
    });
    const updated = await updateSavingsMovementAmount(
      created.movement.id,
      USER,
      new Prisma.Decimal("120"),
      { note: "  bonus  " },
    );
    expect(updated).toEqual({ ok: true, balance: 120 });
    expect(store.movements[0].note).toBe("bonus");
    expectInvariant(USER);
  });

  it("returns notFound for an unknown movement", async () => {
    const result = await updateSavingsMovementAmount(
      "nope",
      USER,
      new Prisma.Decimal("1"),
    );
    expect(result).toEqual({ ok: false, reason: "notFound" });
  });
});

describe("setMonthlySavingsContribution", () => {
  it("inserts the first contribution for a month", async () => {
    const r = await setMonthlySavingsContribution({
      userId: USER,
      monthRecordId: "mr_1",
      amount: new Prisma.Decimal("200"),
      currency: "EUR",
    });
    expect(r.replaced).toBe(false);
    expect(r.balance).toBe(200);
    expect(store.movements).toHaveLength(1);
    expect(store.movements[0].kind).toBe(
      SavingsMovementKind.MONTHLY_CONTRIBUTION,
    );
    expectInvariant(USER);
  });

  it("replaces the previous contribution for the same month and re-syncs cache exactly", async () => {
    await setMonthlySavingsContribution({
      userId: USER,
      monthRecordId: "mr_1",
      amount: new Prisma.Decimal("200"),
      currency: "EUR",
    });
    const r = await setMonthlySavingsContribution({
      userId: USER,
      monthRecordId: "mr_1",
      amount: new Prisma.Decimal("310"),
      currency: "EUR",
    });
    expect(r.replaced).toBe(true);
    expect(r.balance).toBe(310);
    const monthly = store.movements.filter(
      (m) => m.kind === SavingsMovementKind.MONTHLY_CONTRIBUTION,
    );
    expect(monthly).toHaveLength(1);
    expectInvariant(USER);
  });
});

describe("removeMonthlySavingsContribution", () => {
  it("returns removed=false when there is nothing to remove", async () => {
    const r = await removeMonthlySavingsContribution({
      userId: USER,
      monthRecordId: "mr_1",
    });
    expect(r).toEqual({ removed: false, balance: 0 });
  });

  it("removes the existing contribution and decrements the cache", async () => {
    await setMonthlySavingsContribution({
      userId: USER,
      monthRecordId: "mr_1",
      amount: new Prisma.Decimal("75"),
      currency: "EUR",
    });
    const r = await removeMonthlySavingsContribution({
      userId: USER,
      monthRecordId: "mr_1",
    });
    expect(r).toEqual({ removed: true, balance: 0 });
    expectInvariant(USER);
  });
});

describe("coverMonthDebt", () => {
  it("returns zeroes when the deficit is zero or negative", async () => {
    const r = await coverMonthDebt({
      userId: USER,
      monthRecordId: "mr_1",
      deficit: new Prisma.Decimal(0),
      currency: "EUR",
    });
    expect(r).toEqual({ covered: 0, remainingDebt: 0, balance: 0 });
    expect(store.movements).toHaveLength(0);
  });

  it("returns covered=0 with the full deficit as remainingDebt when the pile is empty", async () => {
    const r = await coverMonthDebt({
      userId: USER,
      monthRecordId: "mr_1",
      deficit: new Prisma.Decimal("40"),
      currency: "EUR",
    });
    expect(r.covered).toBe(0);
    expect(r.remainingDebt).toBe(40);
    expect(r.balance).toBe(0);
    expect(store.movements).toHaveLength(0);
  });

  it("covers the full deficit when the pile is enough", async () => {
    await recordSavingsMovement({
      userId: USER,
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: new Prisma.Decimal("100"),
      currency: "EUR",
    });
    const r = await coverMonthDebt({
      userId: USER,
      monthRecordId: "mr_1",
      deficit: new Prisma.Decimal("40"),
      currency: "EUR",
    });
    expect(r.covered).toBe(40);
    expect(r.remainingDebt).toBe(0);
    expect(r.balance).toBe(60);
    expectInvariant(USER);
  });

  it("partially covers and returns the remaining debt when the pile is short", async () => {
    await recordSavingsMovement({
      userId: USER,
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: new Prisma.Decimal("30"),
      currency: "EUR",
    });
    const r = await coverMonthDebt({
      userId: USER,
      monthRecordId: "mr_1",
      deficit: new Prisma.Decimal("75"),
      currency: "EUR",
    });
    expect(r.covered).toBe(30);
    expect(r.remainingDebt).toBe(45);
    expect(r.balance).toBe(0);
    expectInvariant(USER);
  });

  it("is idempotent per month: replaces a prior coverage instead of stacking", async () => {
    await recordSavingsMovement({
      userId: USER,
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: new Prisma.Decimal("200"),
      currency: "EUR",
    });
    await coverMonthDebt({
      userId: USER,
      monthRecordId: "mr_1",
      deficit: new Prisma.Decimal("40"),
      currency: "EUR",
    });
    const r = await coverMonthDebt({
      userId: USER,
      monthRecordId: "mr_1",
      deficit: new Prisma.Decimal("70"),
      currency: "EUR",
    });
    const debtCoverages = store.movements.filter(
      (m) => m.kind === SavingsMovementKind.DEBT_COVERAGE,
    );
    expect(debtCoverages).toHaveLength(1);
    expect(r.covered).toBe(70);
    expect(r.balance).toBe(130);
    expectInvariant(USER);
  });
});

describe("getSavingsState", () => {
  it("returns balance, currency and recent movements", async () => {
    await recordSavingsMovement({
      userId: USER,
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: new Prisma.Decimal("50"),
      currency: "EUR",
    });
    const state = await getSavingsState(USER, { limit: 5 });
    expect(state.balance).toBe(50);
    expect(state.currency).toBe("EUR");
    expect(state.movements).toHaveLength(1);
    expect(state.movements[0]).toMatchObject({
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: 50,
      currency: "EUR",
    });
  });
});

describe("findManualDuplicateMovements / deleteManualDuplicateMovements", () => {
  it("returns no groups when there are no duplicates", async () => {
    await recordSavingsMovement({
      userId: USER,
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: new Prisma.Decimal("100"),
      currency: "EUR",
      occurredOn: new Date(Date.UTC(2026, 4, 10)),
    });
    await recordSavingsMovement({
      userId: USER,
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: new Prisma.Decimal("100"),
      currency: "EUR",
      occurredOn: new Date(Date.UTC(2026, 4, 11)),
    });
    const groups = await findManualDuplicateMovements(USER);
    expect(groups).toEqual([]);
  });

  it("groups by (kind, amount, currency, occurredOn, note) and treats null/empty notes as equal", async () => {
    const day = new Date(Date.UTC(2026, 4, 10));
    const a = await recordSavingsMovement({
      userId: USER,
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: new Prisma.Decimal("50"),
      currency: "EUR",
      occurredOn: day,
    });
    const b = await recordSavingsMovement({
      userId: USER,
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: new Prisma.Decimal("50"),
      currency: "EUR",
      occurredOn: day,
      note: "",
    });
    const c = await recordSavingsMovement({
      userId: USER,
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: new Prisma.Decimal("50"),
      currency: "EUR",
      occurredOn: day,
    });

    const groups = await findManualDuplicateMovements(USER);
    expect(groups).toHaveLength(1);
    expect(groups[0].keeperId).toBe(a.movement.id);
    expect(groups[0].duplicateIds).toEqual(
      expect.arrayContaining([b.movement.id, c.movement.id]),
    );
    expect(groups[0]).toMatchObject({
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: 50,
      currency: "EUR",
      occurredOn: "2026-05-10",
    });
  });

  it("does NOT group movements with different notes", async () => {
    const day = new Date(Date.UTC(2026, 4, 10));
    await recordSavingsMovement({
      userId: USER,
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: new Prisma.Decimal("50"),
      currency: "EUR",
      occurredOn: day,
      note: "café",
    });
    await recordSavingsMovement({
      userId: USER,
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: new Prisma.Decimal("50"),
      currency: "EUR",
      occurredOn: day,
      note: "almuerzo",
    });
    const groups = await findManualDuplicateMovements(USER);
    expect(groups).toEqual([]);
  });

  it("ignores system kinds (MONTHLY_CONTRIBUTION, DEBT_COVERAGE, CARRYOVER_DEPOSIT)", async () => {
    const day = new Date(Date.UTC(2026, 4, 10));
    // Two MONTHLY_CONTRIBUTION rows hand-crafted to bypass the per-month
    // unique constraint that the real DB would enforce.
    store.movements.push(
      {
        id: nextId(),
        userId: USER,
        monthRecordId: "mr_1",
        kind: SavingsMovementKind.MONTHLY_CONTRIBUTION,
        amount: new Prisma.Decimal("100"),
        currency: "EUR",
        note: null,
        occurredOn: day,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: nextId(),
        userId: USER,
        monthRecordId: "mr_2",
        kind: SavingsMovementKind.MONTHLY_CONTRIBUTION,
        amount: new Prisma.Decimal("100"),
        currency: "EUR",
        note: null,
        occurredOn: day,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );
    const groups = await findManualDuplicateMovements(USER);
    expect(groups).toEqual([]);
  });

  it("deletes only the extras and adjusts the cache by their summed amount", async () => {
    const day = new Date(Date.UTC(2026, 4, 10));
    await recordSavingsMovement({
      userId: USER,
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: new Prisma.Decimal("80"),
      currency: "EUR",
      occurredOn: day,
    });
    await recordSavingsMovement({
      userId: USER,
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: new Prisma.Decimal("80"),
      currency: "EUR",
      occurredOn: day,
    });
    await recordSavingsMovement({
      userId: USER,
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: new Prisma.Decimal("80"),
      currency: "EUR",
      occurredOn: day,
    });
    expect(store.users.get(USER)!.savings.toString()).toBe("240");

    const groups = await findManualDuplicateMovements(USER);
    const result = await deleteManualDuplicateMovements(
      USER,
      groups.flatMap((g) => g.duplicateIds),
    );
    expect(result.deletedCount).toBe(2);
    expect(result.balance).toBe(80);
    expect(store.movements).toHaveLength(1);
    expectInvariant(USER);
  });

  it("ignores system-kind ids and ids from other users without throwing", async () => {
    ensureUser(OTHER_USER, "EUR");
    const day = new Date(Date.UTC(2026, 4, 10));
    const mine = await recordSavingsMovement({
      userId: USER,
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: new Prisma.Decimal("20"),
      currency: "EUR",
      occurredOn: day,
    });
    const theirs = await recordSavingsMovement({
      userId: OTHER_USER,
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: new Prisma.Decimal("20"),
      currency: "EUR",
      occurredOn: day,
    });
    // Hand-craft a system-kind row owned by USER.
    const systemId = nextId();
    store.movements.push({
      id: systemId,
      userId: USER,
      monthRecordId: "mr_1",
      kind: SavingsMovementKind.DEBT_COVERAGE,
      amount: new Prisma.Decimal("-15"),
      currency: "EUR",
      note: null,
      occurredOn: day,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    store.users.get(USER)!.savings = store.users.get(USER)!.savings.minus(15);

    const result = await deleteManualDuplicateMovements(USER, [
      systemId,
      theirs.movement.id,
      "mv_does_not_exist",
      mine.movement.id,
    ]);
    expect(result.deletedCount).toBe(1);
    expect(result.skippedSystemKinds).toBe(1);
    expect(result.skippedNotFound).toBe(2);
    expect(store.movements.find((m) => m.id === systemId)).toBeDefined();
    expect(store.movements.find((m) => m.id === theirs.movement.id)).toBeDefined();
    expectInvariant(USER);
    expectInvariant(OTHER_USER);
  });

  it("is a no-op when called with an empty id list", async () => {
    await recordSavingsMovement({
      userId: USER,
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: new Prisma.Decimal("10"),
      currency: "EUR",
    });
    const result = await deleteManualDuplicateMovements(USER, []);
    expect(result).toEqual({
      deletedCount: 0,
      skippedSystemKinds: 0,
      skippedNotFound: 0,
      balance: 10,
    });
  });
});

describe("recomputeSavingsCache", () => {
  it("rebuilds the cache from the ledger when the cache drifts", async () => {
    await recordSavingsMovement({
      userId: USER,
      kind: SavingsMovementKind.MANUAL_DEPOSIT,
      amount: new Prisma.Decimal("60"),
      currency: "EUR",
    });
    store.users.get(USER)!.savings = new Prisma.Decimal("999");
    const balance = await recomputeSavingsCache(USER);
    expect(balance).toBe(60);
    expectInvariant(USER);
  });

  it("zeros the cache when there are no movements", async () => {
    store.users.get(USER)!.savings = new Prisma.Decimal("123");
    const balance = await recomputeSavingsCache(USER);
    expect(balance).toBe(0);
    expectInvariant(USER);
  });
});
