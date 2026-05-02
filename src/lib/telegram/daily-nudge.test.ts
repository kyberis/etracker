import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runDailyNudge, verifyCronSecret } from "./daily-nudge";

type UserRow = {
  id: string;
  locale: string;
  country: string | null;
  telegramChatId: bigint | null;
  telegramNudgeLastSentAt: Date | null;
  isActive: boolean;
  telegramVerifiedAt: Date | null;
  telegramNudgeEnabled: boolean;
};

const store = {
  users: [] as UserRow[],
  expense: [] as { userId: string; createdAt: Date }[],
  income: [] as { userId: string; createdAt: Date }[],
  savings: [] as {
    userId: string;
    createdAt: Date;
    kind: string;
  }[],
  userUpdates: [] as { id: string; data: Record<string, unknown> }[],
  telegramMessages: [] as Record<string, unknown>[],
};

const lazyDb = vi.hoisted(() => ({ db: {} as Record<string, unknown> }));
vi.mock("@/lib/db", () => ({ db: lazyDb.db }));

const sentMessages: { chatId: bigint; text: string }[] = [];
vi.mock("@/lib/telegram/client", () => ({
  sendTelegramHtmlMessage: async (
    chatId: bigint,
    text: string,
  ) => {
    sentMessages.push({ chatId, text });
  },
}));

const aiState = { shouldThrow: false, text: "Hola, ¿tenés algo para cargar?" };
vi.mock("@/lib/ai/run-expense-agent", () => ({
  generateSystemInitiatedReply: async () => {
    if (aiState.shouldThrow) {
      throw new Error("gateway unreachable");
    }
    return { text: aiState.text, usage: {}, model: "openai/gpt-test" };
  },
}));

type WhereClause = {
  userId: string;
  createdAt: { gte: Date; lt: Date };
  kind?: { in: string[] };
};

function matchesWindow(
  row: { userId: string; createdAt: Date },
  where: WhereClause,
): boolean {
  if (row.userId !== where.userId) return false;
  return (
    row.createdAt >= where.createdAt.gte &&
    row.createdAt < where.createdAt.lt
  );
}

const dbClient = {
  user: {
    findMany: async () => {
      return store.users
        .filter(
          (u) =>
            u.isActive &&
            u.telegramChatId !== null &&
            u.telegramVerifiedAt !== null &&
            u.telegramNudgeEnabled,
        )
        .map((u) => ({
          id: u.id,
          locale: u.locale,
          country: u.country,
          telegramChatId: u.telegramChatId,
          telegramNudgeLastSentAt: u.telegramNudgeLastSentAt,
        }));
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { telegramNudgeLastSentAt?: Date };
    }) => {
      store.userUpdates.push({ id: where.id, data });
      const u = store.users.find((x) => x.id === where.id);
      if (u && data.telegramNudgeLastSentAt !== undefined) {
        u.telegramNudgeLastSentAt = data.telegramNudgeLastSentAt;
      }
      return { id: where.id };
    },
  },
  monthExpenseLine: {
    findFirst: async ({ where }: { where: WhereClause }) => {
      const m = store.expense.find((r) => matchesWindow(r, where));
      return m ? { id: "e" } : null;
    },
  },
  monthIncomeLine: {
    findFirst: async ({ where }: { where: WhereClause }) => {
      const m = store.income.find((r) => matchesWindow(r, where));
      return m ? { id: "i" } : null;
    },
  },
  savingsMovement: {
    findFirst: async ({ where }: { where: WhereClause }) => {
      const kinds = where.kind?.in ?? [];
      const m = store.savings.find(
        (r) => kinds.includes(r.kind) && matchesWindow(r, where),
      );
      return m ? { id: "s" } : null;
    },
  },
  telegramMessage: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      store.telegramMessages.push(data);
      return { id: "msg" };
    },
  },
  $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
};

function resetState() {
  store.users = [];
  store.expense = [];
  store.income = [];
  store.savings = [];
  store.userUpdates = [];
  store.telegramMessages = [];
  sentMessages.length = 0;
  aiState.shouldThrow = false;
  aiState.text = "Hola, ¿tenés algo para cargar?";
}

beforeEach(() => {
  resetState();
  Object.assign(lazyDb.db, dbClient);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function addLinkedUser(overrides: Partial<UserRow> = {}): UserRow {
  const base: UserRow = {
    id: "user-1",
    locale: "es",
    country: "AR",
    telegramChatId: BigInt(12345),
    telegramNudgeLastSentAt: null,
    isActive: true,
    telegramVerifiedAt: new Date("2026-01-01Z"),
    telegramNudgeEnabled: true,
  };
  const u: UserRow = { ...base, ...overrides };
  store.users.push(u);
  return u;
}

// 2026-05-02T23:00:00Z is 20:00 local in America/Argentina/Buenos_Aires.
const NOW_AR_20 = new Date(Date.UTC(2026, 4, 2, 23, 0, 0));

describe("runDailyNudge", () => {
  it("sends a nudge when user has no activity today at their local 20:00", async () => {
    addLinkedUser();
    const stats = await runDailyNudge(NOW_AR_20);
    expect(stats.consideredUsers).toBe(1);
    expect(stats.sent).toBe(1);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].chatId).toBe(BigInt(12345));
    expect(store.userUpdates).toHaveLength(1);
    expect(store.userUpdates[0].data.telegramNudgeLastSentAt).toEqual(
      NOW_AR_20,
    );
    expect(store.telegramMessages).toHaveLength(1);
    expect((store.telegramMessages[0] as { role: string }).role).toBe(
      "assistant",
    );
  });

  it("skips users whose local hour is not the nudge hour", async () => {
    addLinkedUser({ country: "ES" });
    // ES at 23:00 UTC in May is 01:00 local (DST), not 20:00.
    const stats = await runDailyNudge(NOW_AR_20);
    expect(stats.sent).toBe(0);
    expect(stats.skippedWrongHour).toBe(1);
    expect(sentMessages).toHaveLength(0);
  });

  it("skips users who already logged an expense today", async () => {
    addLinkedUser();
    store.expense.push({
      userId: "user-1",
      createdAt: new Date("2026-05-02T15:00:00Z"),
    });
    const stats = await runDailyNudge(NOW_AR_20);
    expect(stats.sent).toBe(0);
    expect(stats.skippedHasActivity).toBe(1);
  });

  it("skips users who already logged income today", async () => {
    addLinkedUser();
    store.income.push({
      userId: "user-1",
      createdAt: new Date("2026-05-02T18:00:00Z"),
    });
    const stats = await runDailyNudge(NOW_AR_20);
    expect(stats.sent).toBe(0);
    expect(stats.skippedHasActivity).toBe(1);
  });

  it("skips users who already received a nudge today (idempotency)", async () => {
    // Last nudge was 3 hours ago — still within local-day bounds.
    addLinkedUser({
      telegramNudgeLastSentAt: new Date("2026-05-02T20:00:00Z"),
    });
    const stats = await runDailyNudge(NOW_AR_20);
    expect(stats.sent).toBe(0);
    expect(stats.skippedAlreadySentToday).toBe(1);
  });

  it("sends when last nudge was yesterday", async () => {
    addLinkedUser({
      telegramNudgeLastSentAt: new Date("2026-05-01T23:00:00Z"), // prev local day
    });
    const stats = await runDailyNudge(NOW_AR_20);
    expect(stats.sent).toBe(1);
  });

  it("skips inactive / unlinked / opted-out users", async () => {
    addLinkedUser({ id: "u-inactive", isActive: false });
    addLinkedUser({ id: "u-unlinked", telegramVerifiedAt: null });
    addLinkedUser({ id: "u-nonudge", telegramNudgeEnabled: false });
    const stats = await runDailyNudge(NOW_AR_20);
    expect(stats.consideredUsers).toBe(0);
    expect(stats.sent).toBe(0);
    expect(sentMessages).toHaveLength(0);
  });

  it("counts manual savings movements as activity", async () => {
    addLinkedUser();
    store.savings.push({
      userId: "user-1",
      createdAt: new Date("2026-05-02T14:00:00Z"),
      kind: "MANUAL_DEPOSIT",
    });
    const stats = await runDailyNudge(NOW_AR_20);
    expect(stats.skippedHasActivity).toBe(1);
    expect(stats.sent).toBe(0);
  });

  it("ignores MONTHLY_CONTRIBUTION as activity (system movement)", async () => {
    addLinkedUser();
    store.savings.push({
      userId: "user-1",
      createdAt: new Date("2026-05-02T14:00:00Z"),
      kind: "MONTHLY_CONTRIBUTION",
    });
    const stats = await runDailyNudge(NOW_AR_20);
    expect(stats.sent).toBe(1);
  });

  it("falls back to deterministic copy when the AI throws", async () => {
    addLinkedUser();
    aiState.shouldThrow = true;
    const stats = await runDailyNudge(NOW_AR_20);
    expect(stats.sent).toBe(1);
    expect(sentMessages[0].text).toContain("Clara");
  });
});

describe("verifyCronSecret", () => {
  const ORIGINAL = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "shh-this-is-a-test-secret-long-enough";
  });
  afterEach(() => {
    if (ORIGINAL) process.env.CRON_SECRET = ORIGINAL;
    else delete process.env.CRON_SECRET;
  });

  it("accepts Authorization: Bearer <secret>", () => {
    const req = new Request("https://example.com/api/cron/daily-nudge", {
      headers: {
        authorization: "Bearer shh-this-is-a-test-secret-long-enough",
      },
    });
    expect(verifyCronSecret(req)).toBe(true);
  });

  it("rejects a mismatched secret", () => {
    const req = new Request("https://example.com/api/cron/daily-nudge", {
      headers: { authorization: "Bearer wrong-secret" },
    });
    expect(verifyCronSecret(req)).toBe(false);
  });

  it("rejects missing header", () => {
    const req = new Request("https://example.com/api/cron/daily-nudge");
    expect(verifyCronSecret(req)).toBe(false);
  });

  it("rejects when the env secret is missing", () => {
    delete process.env.CRON_SECRET;
    const req = new Request("https://example.com/api/cron/daily-nudge", {
      headers: { authorization: "Bearer any-value" },
    });
    expect(verifyCronSecret(req)).toBe(false);
  });
});
