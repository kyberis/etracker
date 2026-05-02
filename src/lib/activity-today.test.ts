import { beforeEach, describe, expect, it, vi } from "vitest";

import { userLoggedFinancialActivityToday } from "./activity-today";

type Row = { id: string; userId: string; createdAt: Date };
type SavingsRow = Row & { kind: string };

const store = {
  expense: [] as Row[],
  income: [] as Row[],
  savings: [] as SavingsRow[],
};

const lazyDb = vi.hoisted(() => ({ db: {} as Record<string, unknown> }));
vi.mock("@/lib/db", () => ({ db: lazyDb.db }));

type FindFirstArgs = {
  where: {
    userId: string;
    createdAt: { gte: Date; lt: Date };
    kind?: { in: string[] };
  };
};

function matches(
  row: { userId: string; createdAt: Date },
  where: FindFirstArgs["where"],
): boolean {
  return (
    row.userId === where.userId &&
    row.createdAt >= where.createdAt.gte &&
    row.createdAt < where.createdAt.lt
  );
}

const dbClient = {
  monthExpenseLine: {
    findFirst: async ({ where }: FindFirstArgs) => {
      const match = store.expense.find((r) => matches(r, where));
      return match ? { id: match.id } : null;
    },
  },
  monthIncomeLine: {
    findFirst: async ({ where }: FindFirstArgs) => {
      const match = store.income.find((r) => matches(r, where));
      return match ? { id: match.id } : null;
    },
  },
  savingsMovement: {
    findFirst: async ({ where }: FindFirstArgs) => {
      const allowedKinds = where.kind?.in ?? [];
      const match = store.savings.find(
        (r) => allowedKinds.includes(r.kind) && matches(r, where),
      );
      return match ? { id: match.id } : null;
    },
  },
};

beforeEach(() => {
  store.expense = [];
  store.income = [];
  store.savings = [];
  Object.assign(lazyDb.db, dbClient);
});

describe("userLoggedFinancialActivityToday", () => {
  const startUtc = new Date("2026-05-02T03:00:00Z");
  const endUtc = new Date("2026-05-03T03:00:00Z");

  it("returns false when the user has no activity in the window", async () => {
    const result = await userLoggedFinancialActivityToday(
      "u1",
      startUtc,
      endUtc,
    );
    expect(result).toBe(false);
  });

  it("returns true when an expense line was created in the window", async () => {
    store.expense.push({
      id: "e1",
      userId: "u1",
      createdAt: new Date("2026-05-02T10:00:00Z"),
    });
    expect(
      await userLoggedFinancialActivityToday("u1", startUtc, endUtc),
    ).toBe(true);
  });

  it("returns true when an income line was created in the window", async () => {
    store.income.push({
      id: "i1",
      userId: "u1",
      createdAt: new Date("2026-05-02T15:00:00Z"),
    });
    expect(
      await userLoggedFinancialActivityToday("u1", startUtc, endUtc),
    ).toBe(true);
  });

  it("returns true on a manual savings movement in the window", async () => {
    store.savings.push({
      id: "s1",
      userId: "u1",
      kind: "MANUAL_DEPOSIT",
      createdAt: new Date("2026-05-02T12:00:00Z"),
    });
    expect(
      await userLoggedFinancialActivityToday("u1", startUtc, endUtc),
    ).toBe(true);
  });

  it("ignores system-generated savings movements", async () => {
    store.savings.push({
      id: "s1",
      userId: "u1",
      kind: "MONTHLY_CONTRIBUTION",
      createdAt: new Date("2026-05-02T12:00:00Z"),
    });
    expect(
      await userLoggedFinancialActivityToday("u1", startUtc, endUtc),
    ).toBe(false);
  });

  it("scopes by user id", async () => {
    store.expense.push({
      id: "e1",
      userId: "other",
      createdAt: new Date("2026-05-02T10:00:00Z"),
    });
    expect(
      await userLoggedFinancialActivityToday("u1", startUtc, endUtc),
    ).toBe(false);
  });

  it("excludes rows exactly at endUtc (half-open window)", async () => {
    store.expense.push({
      id: "e1",
      userId: "u1",
      createdAt: endUtc,
    });
    expect(
      await userLoggedFinancialActivityToday("u1", startUtc, endUtc),
    ).toBe(false);
  });

  it("excludes rows before startUtc", async () => {
    store.expense.push({
      id: "e1",
      userId: "u1",
      createdAt: new Date("2026-05-02T02:59:59Z"),
    });
    expect(
      await userLoggedFinancialActivityToday("u1", startUtc, endUtc),
    ).toBe(false);
  });
});
