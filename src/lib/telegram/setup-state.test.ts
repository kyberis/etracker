import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toMonthStart, parseMonthKey, getCurrentMonthKey } from "@/lib/months";

import { loadTelegramSetupHint } from "./setup-state";

type UserRow = {
  primaryCurrency: string;
  primaryCurrencyConfirmedAt: Date | null;
  locale: string;
};

const store = {
  users: new Map<string, UserRow>(),
  incomeCounts: new Map<string, number>(),
  expenseCounts: new Map<string, number>(),
};

const lazyDb = vi.hoisted(() => ({ db: {} as Record<string, unknown> }));
vi.mock("@/lib/db", () => ({ db: lazyDb.db }));

const dbClient = {
  user: {
    findUnique: async ({ where }: { where: { id: string } }) => {
      return store.users.get(where.id) ?? null;
    },
  },
  monthIncomeLine: {
    count: async ({
      where,
    }: {
      where: {
        userId: string;
        monthRecord: { month: Date };
      };
    }) => {
      const key = `${where.userId}:${where.monthRecord.month.toISOString()}`;
      return store.incomeCounts.get(key) ?? 0;
    },
  },
  monthExpenseLine: {
    count: async ({
      where,
    }: {
      where: {
        userId: string;
        monthRecord: { month: Date };
      };
    }) => {
      const key = `${where.userId}:${where.monthRecord.month.toISOString()}`;
      return store.expenseCounts.get(key) ?? 0;
    },
  },
  $transaction: async (calls: Promise<unknown>[]) => Promise.all(calls),
};

beforeEach(() => {
  store.users.clear();
  store.incomeCounts.clear();
  store.expenseCounts.clear();
  Object.assign(lazyDb.db, dbClient);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setUser(
  id: string,
  fields: Partial<UserRow> & { primaryCurrencyConfirmedAt?: Date | null } = {},
) {
  store.users.set(id, {
    primaryCurrency: fields.primaryCurrency ?? "USD",
    primaryCurrencyConfirmedAt: fields.primaryCurrencyConfirmedAt ?? null,
    locale: fields.locale ?? "es",
  });
}

function setLineCounts(userId: string, income: number, expense: number) {
  const month = toMonthStart(parseMonthKey(getCurrentMonthKey()));
  const key = `${userId}:${month.toISOString()}`;
  store.incomeCounts.set(key, income);
  store.expenseCounts.set(key, expense);
}

describe("loadTelegramSetupHint", () => {
  it("returns needsSetup=true when currency is unconfirmed and no movements", async () => {
    setUser("u1");
    setLineCounts("u1", 0, 0);
    const hint = await loadTelegramSetupHint("u1");
    expect(hint.needsSetup).toBe(true);
    expect(hint.currencyConfirmed).toBe(false);
    expect(hint.hasIncomeThisMonth).toBe(false);
    expect(hint.hasExpenseThisMonth).toBe(false);
    expect(hint.primaryCurrency).toBe("USD");
    expect(hint.locale).toBe("es");
  });

  it("returns needsSetup=true when currency is confirmed but no movements yet", async () => {
    setUser("u2", { primaryCurrencyConfirmedAt: new Date() });
    setLineCounts("u2", 0, 0);
    const hint = await loadTelegramSetupHint("u2");
    expect(hint.needsSetup).toBe(true);
    expect(hint.currencyConfirmed).toBe(true);
  });

  it("returns needsSetup=true when there are movements but currency was never confirmed", async () => {
    setUser("u3");
    setLineCounts("u3", 1, 0);
    const hint = await loadTelegramSetupHint("u3");
    expect(hint.needsSetup).toBe(true);
    expect(hint.currencyConfirmed).toBe(false);
    expect(hint.hasIncomeThisMonth).toBe(true);
  });

  it("returns needsSetup=false when currency is confirmed and there is at least one income", async () => {
    setUser("u4", {
      primaryCurrencyConfirmedAt: new Date(),
      primaryCurrency: "ARS",
    });
    setLineCounts("u4", 1, 0);
    const hint = await loadTelegramSetupHint("u4");
    expect(hint.needsSetup).toBe(false);
    expect(hint.hasIncomeThisMonth).toBe(true);
    expect(hint.hasExpenseThisMonth).toBe(false);
    expect(hint.primaryCurrency).toBe("ARS");
  });

  it("returns needsSetup=false when currency is confirmed and there is at least one expense", async () => {
    setUser("u5", {
      primaryCurrencyConfirmedAt: new Date(),
      locale: "en",
    });
    setLineCounts("u5", 0, 1);
    const hint = await loadTelegramSetupHint("u5");
    expect(hint.needsSetup).toBe(false);
    expect(hint.hasExpenseThisMonth).toBe(true);
    expect(hint.locale).toBe("en");
  });

  it("returns a safe default when the user does not exist", async () => {
    const hint = await loadTelegramSetupHint("missing");
    expect(hint.needsSetup).toBe(false);
    expect(hint.primaryCurrency).toBe("USD");
    expect(hint.locale).toBe("es");
  });
});
