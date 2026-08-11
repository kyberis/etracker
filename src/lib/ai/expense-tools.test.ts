import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────
// All DB-touching modules used by `buildExpenseTools` are mocked so the tools
// can be exercised in isolation. We don't try to mock convertToPrimary /
// loadMonthPageData / month-bucket helpers because the tests below only
// touch banks, templates, line delete, getFxRate and updateMonthLine partial.

vi.mock("@/lib/db", () => ({
  db: {
    bank: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    expense: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    monthExpenseLine: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    event: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    eventParticipant: {
      findUnique: vi.fn(),
    },
    income: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    monthIncomeLine: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    monthRecord: { findFirst: vi.fn() },
    savingsMovement: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/savings", () => ({
  getSavingsState: vi.fn(),
  recordSavingsMovement: vi.fn(),
  setMonthlySavingsContribution: vi.fn(),
  removeMonthlySavingsContribution: vi.fn(),
  deleteSavingsMovement: vi.fn(),
  findManualDuplicateMovements: vi.fn(),
  deleteManualDuplicateMovements: vi.fn(),
}));

vi.mock("@/lib/month-bucket", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/month-bucket")>(
      "@/lib/month-bucket",
    );
  return {
    ...actual,
    applyPrevMonthLeftoverDecision: vi.fn(),
    mergePendingTemplateLinesIntoMonth: vi.fn(),
  };
});

vi.mock("@/lib/cache/banks", () => ({
  getBanksCached: vi.fn(),
  invalidateBanksCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/year-timeline-data", () => ({
  expireYearTimeline: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/month-line-bucket", async () => {
  const actual = await vi.importActual<typeof import("@/lib/month-line-bucket")>(
    "@/lib/month-line-bucket",
  );
  return {
    ...actual,
    resolveMonthRecordId: vi.fn().mockResolvedValue("month_1"),
  };
});

vi.mock("@/lib/fx/rates", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/fx/rates")>("@/lib/fx/rates");
  return {
    ...actual,
    fetchFxRate: vi.fn(),
  };
});

import { buildExpenseTools } from "@/lib/ai/expense-tools";
import { db } from "@/lib/db";
import { invalidateBanksCache } from "@/lib/cache/banks";
import { FxUnavailableError, fetchFxRate } from "@/lib/fx/rates";
import { expireYearTimeline } from "@/lib/year-timeline-data";
import {
  deleteManualDuplicateMovements,
  deleteSavingsMovement,
  findManualDuplicateMovements,
  getSavingsState,
  recordSavingsMovement,
  removeMonthlySavingsContribution,
  setMonthlySavingsContribution,
} from "@/lib/savings";
import { SavingsMovementKind } from "@prisma/client";
import { applyPrevMonthLeftoverDecision } from "@/lib/month-bucket";
import { resolveMonthRecordId } from "@/lib/month-line-bucket";

const USER_ID = "user_1";
const OTHER_USER = "user_2";

/** ai-sdk's tool().execute requires a 2nd `options` arg we don't use here. */
const execOpts = {} as never;

function tools() {
  return buildExpenseTools(USER_ID);
}

/** Minimal create() payload returned by Prisma mocks for month expense lines. */
function mockMonthExpenseLine(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "line_1",
    name: "Expense",
    amount: new Prisma.Decimal("200"),
    currency: "USD",
    fxRate: new Prisma.Decimal("1"),
    amountConverted: new Prisma.Decimal("200"),
    category: "OTROS",
    paid: true,
    occurredOn: new Date(Date.UTC(2026, 4, 20)),
    occurredOnSource: "USER",
    eventId: null,
    ...overrides,
  };
}

function uniqueViolation() {
  // Prisma surfaces this concrete subclass; our `isUniqueViolation` helper
  // matches it by code.
  return new Prisma.PrismaClientKnownRequestError(
    "Unique constraint failed",
    { code: "P2002", clientVersion: "test" } as { code: string; clientVersion: string },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Schema surface ───────────────────────────────────────────────────────────

describe("buildExpenseTools — registered surface", () => {
  it("exposes every tool the agent needs to manage user data from chat", () => {
    const t = tools();
    for (const name of [
      "createBank",
      "updateBank",
      "deleteBank",
      "updateExpenseTemplate",
      "deleteExpenseTemplate",
      "deleteMonthLine",
      "getFxRate",
      // Income tools mirror the expense ones.
      "createIncomeTemplate",
      "updateIncomeTemplate",
      "deleteIncomeTemplate",
      "addIncomeLine",
    ] as const) {
      expect(t[name]).toBeDefined();
      expect(typeof (t[name] as { execute: unknown }).execute).toBe("function");
    }
  });

  it("updateMonthLine accepts the new bank/category/occurredOn fields", () => {
    const schema = (
      tools().updateMonthLine as unknown as { inputSchema: import("zod").ZodTypeAny }
    ).inputSchema;
    expect(
      schema.safeParse({
        id: "line_1",
        bankId: "bank_1",
        category: "ALIMENTACION",
        occurredOn: "2026-04-15",
      }).success,
    ).toBe(true);

    expect(schema.safeParse({ id: "x", occurredOn: "no-fecha" }).success).toBe(
      false,
    );
  });
});

// ── createBank ──────────────────────────────────────────────────────────────

describe("createBank", () => {
  it("normalises hex color and invalidates the banks cache on success", async () => {
    vi.mocked(db.bank.create).mockResolvedValue({
      id: "bank_1",
      userId: USER_ID,
      name: "Visa",
      color: "#1f6feb",
    } as never);

    const result = await tools().createBank.execute!(
      { name: "  Visa  ", color: "1f6feb" },
      execOpts,
    );

    expect(db.bank.create).toHaveBeenCalledWith({
      data: { userId: USER_ID, name: "Visa", color: "#1f6feb" },
    });
    expect(invalidateBanksCache).toHaveBeenCalledWith(USER_ID);
    expect(result).toMatchObject({ ok: true, bank: { id: "bank_1", name: "Visa" } });
  });

  it("returns { error } on duplicate name (P2002) without throwing", async () => {
    vi.mocked(db.bank.create).mockRejectedValue(uniqueViolation());

    const result = await tools().createBank.execute!(
      { name: "Galicia" },
      execOpts,
    );

    expect(result).toEqual({ error: 'A bank named "Galicia" already exists.' });
    expect(invalidateBanksCache).not.toHaveBeenCalled();
  });
});

// ── updateBank ──────────────────────────────────────────────────────────────

describe("updateBank", () => {
  it("rejects when the bank belongs to another user", async () => {
    vi.mocked(db.bank.findFirst).mockResolvedValue(null);

    const result = await tools().updateBank.execute!(
      { id: "bank_other", name: "Hijack" },
      execOpts,
    );

    expect(db.bank.findFirst).toHaveBeenCalledWith({
      where: { id: "bank_other", userId: USER_ID },
    });
    expect(result).toEqual({ error: "The specified bank doesn't exist." });
    expect(db.bank.update).not.toHaveBeenCalled();
  });

  it("clears the color when null is passed explicitly", async () => {
    vi.mocked(db.bank.findFirst).mockResolvedValue({ id: "bank_1" } as never);
    vi.mocked(db.bank.update).mockResolvedValue({
      id: "bank_1",
      name: "Visa",
      color: null,
    } as never);

    const result = await tools().updateBank.execute!(
      { id: "bank_1", color: null },
      execOpts,
    );

    expect(db.bank.update).toHaveBeenCalledWith({
      where: { id: "bank_1" },
      data: { color: null },
    });
    expect(result).toMatchObject({ ok: true, bank: { color: null } });
  });

  it("returns 'nothing to update' when no fields are provided", async () => {
    vi.mocked(db.bank.findFirst).mockResolvedValue({ id: "bank_1" } as never);

    const result = await tools().updateBank.execute!({ id: "bank_1" }, execOpts);

    expect(result).toEqual({ error: "Nothing to update." });
    expect(db.bank.update).not.toHaveBeenCalled();
  });
});

// ── deleteBank ──────────────────────────────────────────────────────────────

describe("deleteBank", () => {
  it("blocks deletion when the bank still has expenses or month lines", async () => {
    vi.mocked(db.bank.findFirst).mockResolvedValue({
      id: "bank_1",
      name: "Visa",
    } as never);
    vi.mocked(db.expense.count).mockResolvedValue(2);
    vi.mocked(db.monthExpenseLine.count).mockResolvedValue(5);

    const result = await tools().deleteBank.execute!(
      { id: "bank_1" },
      execOpts,
    );

    expect(result).toMatchObject({
      templateCount: 2,
      lineCount: 5,
    });
    expect(db.bank.delete).not.toHaveBeenCalled();
    expect(invalidateBanksCache).not.toHaveBeenCalled();
  });

  it("deletes the bank and invalidates cache when there are no FK rows", async () => {
    vi.mocked(db.bank.findFirst).mockResolvedValue({
      id: "bank_1",
      name: "Efectivo",
    } as never);
    vi.mocked(db.expense.count).mockResolvedValue(0);
    vi.mocked(db.monthExpenseLine.count).mockResolvedValue(0);
    vi.mocked(db.bank.delete).mockResolvedValue({} as never);

    const result = await tools().deleteBank.execute!(
      { id: "bank_1" },
      execOpts,
    );

    expect(db.bank.delete).toHaveBeenCalledWith({ where: { id: "bank_1" } });
    expect(invalidateBanksCache).toHaveBeenCalledWith(USER_ID);
    expect(result).toMatchObject({
      ok: true,
      deleted: { id: "bank_1", name: "Efectivo" },
    });
  });

  it("rejects when the bank does not belong to the user", async () => {
    vi.mocked(db.bank.findFirst).mockResolvedValue(null);

    const result = await tools().deleteBank.execute!(
      { id: "bank_other" },
      execOpts,
    );

    expect(result).toEqual({ error: "The specified bank doesn't exist." });
  });
});

// ── updateExpenseTemplate / deleteExpenseTemplate ───────────────────────────

describe("expense templates", () => {
  it("rejects updates that target another user's template", async () => {
    vi.mocked(db.expense.findFirst).mockResolvedValue(null);

    const result = await tools().updateExpenseTemplate.execute!(
      { id: "tpl_1", name: "Alquiler" },
      execOpts,
    );

    expect(db.expense.findFirst).toHaveBeenCalledWith({
      where: { id: "tpl_1", userId: USER_ID },
    });
    expect(result).toEqual({ error: "The specified template doesn't exist." });
  });

  it("forbids endMonth on one-off templates after the change", async () => {
    vi.mocked(db.expense.findFirst).mockResolvedValue({
      id: "tpl_1",
      isRecurring: true,
      startMonth: new Date(Date.UTC(2026, 0, 1)),
      endMonth: null,
    } as never);

    const result = await tools().updateExpenseTemplate.execute!(
      { id: "tpl_1", isRecurring: false, endMonth: "2026-12" },
      execOpts,
    );

    expect(result).toEqual({
      error: "One-off templates can't have an endMonth.",
    });
    expect(db.expense.update).not.toHaveBeenCalled();
  });

  it("deletes a template the user owns and reports detached lines", async () => {
    vi.mocked(db.expense.findFirst).mockResolvedValue({
      id: "tpl_1",
      name: "Spotify",
    } as never);
    vi.mocked(db.monthExpenseLine.count).mockResolvedValue(3);
    vi.mocked(db.expense.delete).mockResolvedValue({} as never);

    const result = await tools().deleteExpenseTemplate.execute!(
      { id: "tpl_1" },
      execOpts,
    );

    expect(db.expense.delete).toHaveBeenCalledWith({ where: { id: "tpl_1" } });
    expect(result).toEqual({
      ok: true,
      deleted: { id: "tpl_1", name: "Spotify" },
      detachedLineCount: 3,
    });
  });
});

// ── income tools ────────────────────────────────────────────────────────────

describe("income tools", () => {
  const PRIMARY = "EUR";
  const today = new Date();
  const monthStart = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
  );

  beforeEach(() => {
    vi.mocked(db.user.findUnique).mockResolvedValue({
      primaryCurrency: PRIMARY,
    } as never);
    vi.mocked(db.monthRecord.findFirst).mockResolvedValue({
      id: "mr_current",
      month: monthStart,
    } as never);
    vi.mocked(fetchFxRate).mockResolvedValue(new Prisma.Decimal("1.0"));
  });

  it("creates an income template scoped to the bound user", async () => {
    vi.mocked(db.bank.findFirst).mockResolvedValue({ id: "bank_1" } as never);
    vi.mocked(db.income.create).mockResolvedValue({
      id: "inc_1",
      name: "Sueldo",
      amount: new Prisma.Decimal("1500.00"),
      currency: "EUR",
      isRecurring: true,
      startMonth: new Date(Date.UTC(2026, 4, 1)),
      endMonth: null,
      bankId: "bank_1",
      bank: { name: "Galicia" },
      category: "SUELDO",
    } as never);

    const result = await tools().createIncomeTemplate.execute!(
      {
        name: " Sueldo ",
        amount: 1500,
        bankId: "bank_1",
        isRecurring: true,
        startMonth: "2026-05",
        category: "SUELDO",
      } as never,
      execOpts,
    );

    expect(db.income.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: USER_ID,
          name: "Sueldo",
          category: "SUELDO",
          bankId: "bank_1",
        }),
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      income: { id: "inc_1", name: "Sueldo", category: "SUELDO" },
    });
  });

  it("addIncomeLine records a freelance payment as received by default", async () => {
    vi.mocked(db.monthIncomeLine.create).mockResolvedValue({
      id: "iline_1",
      name: "Freelance",
      amount: new Prisma.Decimal("250.00"),
      currency: "EUR",
      fxRate: new Prisma.Decimal("1.0000000000"),
      amountConverted: new Prisma.Decimal("250.00"),
      occurredOn: new Date(Date.UTC(2026, 4, 12)),
      category: "FREELANCE",
      received: true,
    } as never);

    const result = await tools().addIncomeLine.execute!(
      {
        name: "Freelance",
        amount: 250,
        category: "FREELANCE",
        received: true,
      } as never,
      execOpts,
    );

    expect(db.monthIncomeLine.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        monthRecordId: "month_1",
        templateId: null,
        bankId: null,
        name: "Freelance",
        currency: PRIMARY,
        category: "FREELANCE",
        received: true,
      }),
    });
    expect(result).toMatchObject({
      ok: true,
      duplicate: false,
      line: { id: "iline_1", name: "Freelance", received: true },
    });
  });

  it("addIncomeLine surfaces duplicate=true on unique violation", async () => {
    vi.mocked(db.monthIncomeLine.create).mockRejectedValue(uniqueViolation());

    const result = await tools().addIncomeLine.execute!(
      { name: "Sueldo", amount: 1500 } as never,
      execOpts,
    );

    expect(result).toMatchObject({ ok: true, duplicate: true });
  });

  it("addIncomeLine errors when the target month cannot be created", async () => {
    vi.mocked(resolveMonthRecordId).mockRejectedValueOnce(new Error("db unavailable"));

    const result = await tools().addIncomeLine.execute!(
      { name: "Sueldo", amount: 1500 } as never,
      execOpts,
    );

    expect(result).toMatchObject({
      error: expect.stringContaining("createMonthIfNeeded") as unknown,
    });
    expect(db.monthIncomeLine.create).not.toHaveBeenCalled();
  });
});

// ── addMonthLine + event wallet validation ─────────────────────────────────

describe("addMonthLine — eventId validation", () => {
  beforeEach(() => {
    vi.mocked(db.user.findUnique).mockResolvedValue({
      primaryCurrency: "USD",
    } as never);
    vi.mocked(db.monthRecord.findFirst).mockResolvedValue({
      id: "month_1",
    } as never);
    vi.mocked(db.bank.findFirst).mockResolvedValue({
      id: "bank_1",
      name: "Visa",
    } as never);
  });

  it("falls back to a standalone line when occurredOn is outside the event range (REGULAR)", async () => {
    // The shared-event refactor switched to findUnique + a participant
    // check. The owner is implicitly an active participant via the
    // backfilled OWNER row, so the mock returns `{ removedAt: null }`.
    vi.mocked(db.event.findUnique).mockResolvedValue({
      id: "event_1",
      name: "Trip to Mendoza",
      status: "OPEN",
      startDate: new Date(Date.UTC(2026, 3, 15)),
      endDate: new Date(Date.UTC(2026, 3, 25)),
      userId: USER_ID,
    } as never);
    vi.mocked(db.eventParticipant.findUnique).mockResolvedValue({
      removedAt: null,
    } as never);
    vi.mocked(db.monthExpenseLine.create).mockResolvedValue(
      mockMonthExpenseLine({ name: "Hotel", eventId: null }) as never,
    );

    const result = (await tools().addMonthLine.execute!(
      {
        name: "Hotel",
        amount: 200,
        bankId: "bank_1",
        eventId: "event_1",
        occurredOn: "2026-05-15",
        currency: "USD",
        category: "OTROS",
        paid: true,
      },
      execOpts,
    )) as {
      ok?: boolean;
      note?: string;
      line?: { eventId?: string | null };
    };

    expect(result.ok).toBe(true);
    expect(result.note).toMatch(/outside/i);
    expect(result.line?.eventId).toBeNull();
    expect(db.monthExpenseLine.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventId: null }),
      }),
    );
  });

  it("falls back to a standalone line when the event is closed (REGULAR)", async () => {
    vi.mocked(db.event.findUnique).mockResolvedValue({
      id: "event_1",
      name: "Trip",
      status: "CLOSED",
      startDate: new Date(Date.UTC(2026, 3, 15)),
      endDate: new Date(Date.UTC(2026, 3, 25)),
      userId: USER_ID,
    } as never);
    vi.mocked(db.eventParticipant.findUnique).mockResolvedValue({
      removedAt: null,
    } as never);
    vi.mocked(db.monthExpenseLine.create).mockResolvedValue(
      mockMonthExpenseLine({ name: "Hotel", eventId: null }) as never,
    );

    const result = (await tools().addMonthLine.execute!(
      {
        name: "Hotel",
        amount: 200,
        bankId: "bank_1",
        eventId: "event_1",
        occurredOn: "2026-04-20",
        currency: "USD",
        category: "OTROS",
        paid: true,
      },
      execOpts,
    )) as {
      ok?: boolean;
      note?: string;
      line?: { eventId?: string | null };
    };

    expect(result.ok).toBe(true);
    expect(result.note).toMatch(/closed/i);
    expect(result.line?.eventId).toBeNull();
    expect(db.monthExpenseLine.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventId: null }),
      }),
    );
  });

  it("attaches the line to the event when occurredOn is inside the range", async () => {
    vi.mocked(db.event.findUnique).mockResolvedValue({
      id: "event_1",
      name: "Trip to Mendoza",
      status: "OPEN",
      startDate: new Date(Date.UTC(2026, 3, 15)),
      endDate: new Date(Date.UTC(2026, 3, 25)),
      userId: USER_ID,
    } as never);
    vi.mocked(db.eventParticipant.findUnique).mockResolvedValue({
      removedAt: null,
    } as never);
    vi.mocked(db.monthExpenseLine.create).mockResolvedValue(
      mockMonthExpenseLine({
        name: "Hotel",
        eventId: "event_1",
      }) as never,
    );

    const result = (await tools().addMonthLine.execute!(
      {
        name: "Hotel",
        amount: 200,
        bankId: "bank_1",
        eventId: "event_1",
        occurredOn: "2026-04-20",
        currency: "USD",
        category: "OTROS",
        paid: true,
      },
      execOpts,
    )) as {
      ok?: boolean;
      duplicate?: boolean;
      line?: { eventId?: string | null; eventName?: string | null };
    };

    expect(result.ok).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.line?.eventId).toBe("event_1");
    expect(result.line?.eventName).toBe("Trip to Mendoza");
    expect(db.monthExpenseLine.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventId: "event_1" }),
      }),
    );
  });

  it("falls back to a standalone line when the event id does not belong to the user (REGULAR)", async () => {
    // The event exists but belongs to ANOTHER user. For REGULAR users we
    // create the line as a standalone expense (with a `note` so the agent
    // self-corrects on the next turn) instead of erroring out — see the
    // telegram bug report where the model kept passing wrong CUIDs and the
    // user could not log anything.
    vi.mocked(db.event.findUnique).mockResolvedValue({
      id: "event_other",
      name: "Stranger's Trip",
      status: "OPEN",
      startDate: new Date(Date.UTC(2026, 3, 15)),
      endDate: new Date(Date.UTC(2026, 3, 25)),
      userId: "stranger",
    } as never);
    // Caller is not a participant either.
    vi.mocked(db.eventParticipant.findUnique).mockResolvedValue(null);
    vi.mocked(db.monthExpenseLine.create).mockResolvedValue(
      mockMonthExpenseLine({ name: "Hotel", eventId: null }) as never,
    );

    const result = (await tools().addMonthLine.execute!(
      {
        name: "Hotel",
        amount: 200,
        bankId: "bank_1",
        eventId: "event_other",
        currency: "USD",
        category: "OTROS",
        paid: true,
      },
      execOpts,
    )) as {
      ok?: boolean;
      note?: string;
      line?: { eventId?: string | null; eventName?: string | null };
    };

    expect(result.ok).toBe(true);
    expect(result.note).toMatch(/not a participant/i);
    expect(result.line?.eventId).toBeNull();
    expect(result.line?.eventName).toBeNull();
    expect(db.monthExpenseLine.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventId: null }),
      }),
    );
  });

  it("falls back to a standalone line when the event id does not exist (REGULAR)", async () => {
    // Real production failure: the model passed a bank id (or any other
    // CUID-shaped value) as eventId. The lookup misses, but the line must
    // still be created so the user gets what they asked for.
    vi.mocked(db.event.findUnique).mockResolvedValue(null);
    vi.mocked(db.monthExpenseLine.create).mockResolvedValue(
      mockMonthExpenseLine({
        id: "line_1",
        name: "Aldi",
        amount: new Prisma.Decimal("29.67"),
        currency: "EUR",
        amountConverted: new Prisma.Decimal("29.67"),
        category: "ALIMENTACION",
        occurredOn: new Date(Date.UTC(2026, 4, 1)),
        eventId: null,
      }) as never,
    );

    const result = (await tools().addMonthLine.execute!(
      {
        name: "Aldi",
        amount: 29.67,
        bankId: "cmofvk9u50001njisb24ukyud",
        eventId: "cmofvk9u50001njisb24ukyud", // bank id passed as event id
        paidByUserId: "cmofvk9u50001njisb24ukyud", // same
        category: "ALIMENTACION",
        currency: "USD", // mock primary currency, avoids FX lookup
        paid: true,
      },
      execOpts,
    )) as {
      ok?: boolean;
      note?: string;
      line?: { eventId?: string | null };
    };

    expect(result.ok).toBe(true);
    expect(result.note).toMatch(/did not match any event/i);
    expect(result.note).toMatch(/bank ids and user ids are not event ids/i);
    expect(result.line?.eventId).toBeNull();
    expect(db.monthExpenseLine.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: null,
          paidByUserId: null,
        }),
      }),
    );
  });

  // Guard against a recurring telegram bug: the model would call addMonthLine
  // with hallucinated eventId/paidByUserId values like "/", ".", "MISSING",
  // or even the trip's name. The DB lookup then fails with "doesn't exist"
  // and the agent never self-corrects. The schema regex must reject anything
  // that doesn't look like a CUID so the tool input fails fast and the model
  // gets a structured validation error it can react to.
  it("schema rejects placeholder strings for eventId and paidByUserId", () => {
    const schema = (
      tools().addMonthLine as unknown as {
        inputSchema: import("zod").ZodTypeAny;
      }
    ).inputSchema;

    const baseInput = {
      name: "Hotel",
      amount: 200,
      bankId: "bank_1",
      category: "OTROS" as const,
      paid: true,
      currency: "USD",
      occurredOn: "2026-04-20",
    };

    for (const placeholder of [
      "/",
      ".",
      ",",
      "MISSING",
      "none",
      "Málaga",
      "trip-name",
      "1",
      "abc",
    ]) {
      expect(
        schema.safeParse({ ...baseInput, eventId: placeholder }).success,
        `eventId=${placeholder} should be rejected`,
      ).toBe(false);
      expect(
        schema.safeParse({ ...baseInput, paidByUserId: placeholder }).success,
        `paidByUserId=${placeholder} should be rejected`,
      ).toBe(false);
    }

    expect(schema.safeParse(baseInput).success).toBe(true);
    expect(
      schema.safeParse({
        ...baseInput,
        eventId: "cmofvkulj0004njis6x1voyzw",
        paidByUserId: "cmofve37y0000njis0lc0sdye",
      }).success,
    ).toBe(true);
  });
});

// ── deleteMonthLine ─────────────────────────────────────────────────────────

describe("deleteMonthLine", () => {
  it("rejects when the line belongs to another user", async () => {
    vi.mocked(db.monthExpenseLine.findFirst).mockResolvedValue(null);

    const result = await tools().deleteMonthLine.execute!(
      { id: "line_other" },
      execOpts,
    );

    expect(db.monthExpenseLine.findFirst).toHaveBeenCalledWith({
      where: { id: "line_other", monthRecord: { userId: USER_ID } },
      include: { monthRecord: { select: { month: true } } },
    });
    expect(result).toEqual({ error: "Line not found." });
    expect(db.monthExpenseLine.delete).not.toHaveBeenCalled();
  });

  it("deletes the line and expires the year-timeline cache", async () => {
    vi.mocked(db.monthExpenseLine.findFirst).mockResolvedValue({
      id: "line_1",
      name: "Café",
      amount: new Prisma.Decimal("3.50"),
      currency: "USD",
      monthRecord: { month: new Date(Date.UTC(2026, 3, 1)) },
    } as never);
    vi.mocked(db.monthExpenseLine.delete).mockResolvedValue({} as never);

    const result = await tools().deleteMonthLine.execute!(
      { id: "line_1" },
      execOpts,
    );

    expect(db.monthExpenseLine.delete).toHaveBeenCalledWith({
      where: { id: "line_1" },
    });
    expect(expireYearTimeline).toHaveBeenCalledWith(USER_ID, 2026);
    expect(result).toMatchObject({
      ok: true,
      deleted: { id: "line_1", name: "Café", currency: "USD" },
    });
  });
});

// ── getFxRate ───────────────────────────────────────────────────────────────

describe("getFxRate", () => {
  it("uses the user's primary currency as default `to`", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({
      primaryCurrency: "EUR",
    } as never);
    vi.mocked(fetchFxRate).mockResolvedValue(new Prisma.Decimal("0.92"));

    const result = await tools().getFxRate.execute!({ from: "USD" }, execOpts);

    expect(fetchFxRate).toHaveBeenCalledWith("USD", "EUR");
    expect(result).toMatchObject({
      ok: true,
      from: "USD",
      to: "EUR",
      fxRate: "0.92",
    });
  });

  it("returns { error } when the upstream is unavailable", async () => {
    vi.mocked(fetchFxRate).mockRejectedValue(
      new FxUnavailableError("USD", "ARS"),
    );

    const result = await tools().getFxRate.execute!(
      { from: "USD", to: "ARS" },
      execOpts,
    );

    expect(result).toMatchObject({
      error: expect.stringContaining("USD->ARS") as unknown,
    });
  });

  it("rejects malformed currency codes via the input schema", () => {
    const schema = (
      tools().getFxRate as unknown as { inputSchema: import("zod").ZodTypeAny }
    ).inputSchema;
    expect(schema.safeParse({ from: "us" }).success).toBe(false);
    expect(schema.safeParse({ from: "USD", to: "EUR" }).success).toBe(true);
  });
});

// ── ownership scoping smoke-test (cross-user) ───────────────────────────────

describe("cross-user safety", () => {
  it("createBank scopes the write to the bound userId, never another", async () => {
    vi.mocked(db.bank.create).mockResolvedValue({
      id: "bank_1",
      userId: USER_ID,
      name: "Visa",
      color: null,
    } as never);

    // Build a separate toolset for OTHER_USER and ensure it would write under
    // OTHER_USER, not USER_ID. This guards against accidental closure leaks.
    const otherTools = buildExpenseTools(OTHER_USER);
    await otherTools.createBank.execute!({ name: "Other" }, execOpts);

    expect(db.bank.create).toHaveBeenCalledWith({
      data: { userId: OTHER_USER, name: "Other", color: null },
    });
  });
});

// ── savings tools ───────────────────────────────────────────────────────────

describe("getSavingsState (agent tool)", () => {
  it("delegates to the savings service with the bound user and includes a summaryText", async () => {
    vi.mocked(getSavingsState).mockResolvedValue({
      balance: 1234.5,
      currency: "EUR",
      movements: [
        {
          id: "mv_1",
          kind: "MANUAL_DEPOSIT" as never,
          amount: 1234.5,
          currency: "EUR",
          note: null,
          monthRecordId: null,
          monthKey: null,
          occurredOn: "2026-04-15",
          createdAt: "2026-04-15T00:00:00.000Z",
        },
      ],
    });
    const result = await tools().getSavingsState.execute!({}, execOpts);
    expect(getSavingsState).toHaveBeenCalledWith(USER_ID, { limit: 20 });
    expect(result).toMatchObject({
      balance: 1234.5,
      currency: "EUR",
      summaryText: expect.stringContaining("EUR"),
    });
  });
});

describe("addSavingsMovement (agent tool)", () => {
  it("blocks MANUAL_WITHDRAWAL when the pile is shorter than the requested amount", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({
      primaryCurrency: "EUR",
      savings: new Prisma.Decimal("10"),
    } as never);
    const result = await tools().addSavingsMovement.execute!(
      { kind: "MANUAL_WITHDRAWAL", amount: 50 },
      execOpts,
    );
    expect(result).toMatchObject({ error: expect.stringContaining("isn't enough") });
    expect(recordSavingsMovement).not.toHaveBeenCalled();
  });

  it("records a deposit with a positive signed amount under the bound user", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({
      primaryCurrency: "EUR",
      savings: new Prisma.Decimal("0"),
    } as never);
    vi.mocked(recordSavingsMovement).mockResolvedValue({
      movement: {
        id: "mv_x",
        kind: "MANUAL_DEPOSIT",
        amount: new Prisma.Decimal("75.00"),
        currency: "EUR",
        note: null,
        monthRecordId: null,
        userId: USER_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
        occurredOn: new Date(Date.UTC(2026, 4, 1)),
      } as never,
      balance: 75,
    });

    const result = await tools().addSavingsMovement.execute!(
      { kind: "MANUAL_DEPOSIT", amount: 75 },
      execOpts,
    );
    const arg = vi.mocked(recordSavingsMovement).mock.calls[0][0];
    expect(arg.userId).toBe(USER_ID);
    expect(arg.kind).toBe("MANUAL_DEPOSIT");
    expect(Number(arg.amount)).toBe(75);
    expect(result).toMatchObject({ ok: true, balance: 75 });
  });

  it("flips the sign for MANUAL_WITHDRAWAL when the pile is enough", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({
      primaryCurrency: "EUR",
      savings: new Prisma.Decimal("100"),
    } as never);
    vi.mocked(recordSavingsMovement).mockResolvedValue({
      movement: {
        id: "mv_x",
        kind: "MANUAL_WITHDRAWAL",
        amount: new Prisma.Decimal("-30.00"),
        currency: "EUR",
        note: null,
        monthRecordId: null,
        userId: USER_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
        occurredOn: new Date(Date.UTC(2026, 4, 1)),
      } as never,
      balance: 70,
    });

    await tools().addSavingsMovement.execute!(
      { kind: "MANUAL_WITHDRAWAL", amount: 30 },
      execOpts,
    );
    const arg = vi.mocked(recordSavingsMovement).mock.calls[0][0];
    expect(Number(arg.amount)).toBe(-30);
  });
});

describe("deleteSavingsMovement (agent tool)", () => {
  it("returns error when the movement does not exist", async () => {
    vi.mocked(db.savingsMovement.findFirst).mockResolvedValue(null);
    const result = await tools().deleteSavingsMovement.execute!(
      { id: "mv_404" },
      execOpts,
    );
    expect(result).toMatchObject({ error: expect.stringContaining("doesn't exist") });
    expect(deleteSavingsMovement).not.toHaveBeenCalled();
  });

  it("blocks system kinds (e.g. MONTHLY_CONTRIBUTION) and points to the right tool", async () => {
    vi.mocked(db.savingsMovement.findFirst).mockResolvedValue({
      id: "mv_sys",
      kind: "MONTHLY_CONTRIBUTION",
      amount: new Prisma.Decimal("100"),
      currency: "EUR",
    } as never);

    const result = await tools().deleteSavingsMovement.execute!(
      { id: "mv_sys" },
      execOpts,
    );

    expect(result).toMatchObject({
      error: expect.stringContaining("removeMonthlySavingsContribution"),
      kind: "MONTHLY_CONTRIBUTION",
    });
    expect(deleteSavingsMovement).not.toHaveBeenCalled();
  });

  it("blocks DEBT_COVERAGE and CARRYOVER_DEPOSIT with a clear message", async () => {
    vi.mocked(db.savingsMovement.findFirst).mockResolvedValue({
      id: "mv_dc",
      kind: "DEBT_COVERAGE",
      amount: new Prisma.Decimal("-50"),
      currency: "EUR",
    } as never);

    const result = await tools().deleteSavingsMovement.execute!(
      { id: "mv_dc" },
      execOpts,
    );

    expect(result).toMatchObject({
      error: expect.stringContaining("carryover"),
      kind: "DEBT_COVERAGE",
    });
    expect(deleteSavingsMovement).not.toHaveBeenCalled();
  });

  it("delegates to the service for MANUAL_DEPOSIT and reports the new balance", async () => {
    vi.mocked(db.savingsMovement.findFirst).mockResolvedValue({
      id: "mv_dep",
      kind: "MANUAL_DEPOSIT",
      amount: new Prisma.Decimal("75"),
      currency: "EUR",
    } as never);
    vi.mocked(deleteSavingsMovement).mockResolvedValue({
      ok: true,
      balance: 25,
    });

    const result = await tools().deleteSavingsMovement.execute!(
      { id: "mv_dep" },
      execOpts,
    );

    expect(deleteSavingsMovement).toHaveBeenCalledWith("mv_dep", USER_ID);
    expect(result).toMatchObject({
      ok: true,
      balance: 25,
      deleted: { id: "mv_dep", kind: "MANUAL_DEPOSIT", amount: 75, currency: "EUR" },
    });
  });

  it("delegates for MANUAL_WITHDRAWAL too (signed amount preserved in the echo)", async () => {
    vi.mocked(db.savingsMovement.findFirst).mockResolvedValue({
      id: "mv_w",
      kind: "MANUAL_WITHDRAWAL",
      amount: new Prisma.Decimal("-30"),
      currency: "EUR",
    } as never);
    vi.mocked(deleteSavingsMovement).mockResolvedValue({
      ok: true,
      balance: 130,
    });

    const result = await tools().deleteSavingsMovement.execute!(
      { id: "mv_w" },
      execOpts,
    );

    expect(deleteSavingsMovement).toHaveBeenCalledWith("mv_w", USER_ID);
    expect(result).toMatchObject({
      ok: true,
      balance: 130,
      deleted: { id: "mv_w", kind: "MANUAL_WITHDRAWAL", amount: -30 },
    });
  });

  it("only ever scopes the lookup to the bound user id", async () => {
    vi.mocked(db.savingsMovement.findFirst).mockResolvedValue(null);
    await tools().deleteSavingsMovement.execute!({ id: "mv_x" }, execOpts);
    expect(db.savingsMovement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "mv_x", userId: USER_ID }),
      }),
    );
    // The tool builder is bound to USER_ID; OTHER_USER must never appear.
    const args = vi.mocked(db.savingsMovement.findFirst).mock.calls[0][0];
    expect(JSON.stringify(args)).not.toContain(OTHER_USER);
  });
});

describe("setMonthlySavingsContribution (agent tool)", () => {
  it("rejects when the month is not configured", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({
      primaryCurrency: "EUR",
    } as never);
    vi.mocked(db.monthRecord.findFirst).mockResolvedValue(null);
    const result = await tools().setMonthlySavingsContribution.execute!(
      { month: "2026-05", amount: 100 },
      execOpts,
    );
    expect(result).toMatchObject({ error: expect.stringContaining("createMonthIfNeeded") });
    expect(setMonthlySavingsContribution).not.toHaveBeenCalled();
  });

  it("upserts the contribution and reports replaced/balance back to the agent", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({
      primaryCurrency: "EUR",
    } as never);
    vi.mocked(db.monthRecord.findFirst).mockResolvedValue({
      id: "mr_1",
    } as never);
    vi.mocked(setMonthlySavingsContribution).mockResolvedValue({
      movement: {
        id: "mv_x",
        amount: new Prisma.Decimal("250.00"),
      } as never,
      balance: 250,
      replaced: true,
    });

    const result = await tools().setMonthlySavingsContribution.execute!(
      { month: "2026-05", amount: 250 },
      execOpts,
    );
    expect(setMonthlySavingsContribution).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        monthRecordId: "mr_1",
        currency: "EUR",
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      replaced: true,
      balance: 250,
      month: "2026-05",
      amount: 250,
    });
  });
});

describe("removeMonthlySavingsContribution (agent tool)", () => {
  it("returns error when the month is not configured", async () => {
    vi.mocked(db.monthRecord.findFirst).mockResolvedValue(null);
    const result = await tools().removeMonthlySavingsContribution.execute!(
      { month: "2026-05" },
      execOpts,
    );
    expect(result).toMatchObject({ error: expect.any(String) });
    expect(removeMonthlySavingsContribution).not.toHaveBeenCalled();
  });

  it("delegates to the service and propagates removed/balance", async () => {
    vi.mocked(db.monthRecord.findFirst).mockResolvedValue({
      id: "mr_1",
    } as never);
    vi.mocked(removeMonthlySavingsContribution).mockResolvedValue({
      removed: true,
      balance: 0,
    });
    const result = await tools().removeMonthlySavingsContribution.execute!(
      { month: "2026-05" },
      execOpts,
    );
    expect(result).toMatchObject({
      ok: true,
      removed: true,
      balance: 0,
      month: "2026-05",
    });
  });
});

describe("dedupeSavingsMovements (agent tool)", () => {
  it("returns ok with empty groups when no duplicates exist", async () => {
    vi.mocked(findManualDuplicateMovements).mockResolvedValue([]);
    const result = await tools().dedupeSavingsMovements.execute!(
      { dryRun: true },
      execOpts,
    );
    expect(findManualDuplicateMovements).toHaveBeenCalledWith(USER_ID);
    expect(deleteManualDuplicateMovements).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      dryRun: true,
      groups: [],
      totalDuplicates: 0,
    });
  });

  it("on dryRun=true (default) returns the detected groups WITHOUT deleting", async () => {
    vi.mocked(findManualDuplicateMovements).mockResolvedValue([
      {
        signature: "MANUAL_DEPOSIT|50.00|EUR|2026-05-10|",
        kind: SavingsMovementKind.MANUAL_DEPOSIT,
        amount: 50,
        currency: "EUR",
        occurredOn: "2026-05-10",
        note: null,
        keeperId: "mv_1",
        duplicateIds: ["mv_2", "mv_3"],
      },
    ]);
    const result = await tools().dedupeSavingsMovements.execute!(
      // Test the default-safety: a missing dryRun must behave as a dry run.
      {} as { dryRun: boolean },
      execOpts,
    );
    expect(deleteManualDuplicateMovements).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      dryRun: true,
      applied: false,
      totalDuplicates: 2,
      groups: [
        {
          kind: SavingsMovementKind.MANUAL_DEPOSIT,
          amount: 50,
          keeperId: "mv_1",
          duplicateIds: ["mv_2", "mv_3"],
          extraCount: 2,
        },
      ],
    });
  });

  it("on dryRun=false flattens the duplicate ids and reports the new balance", async () => {
    vi.mocked(findManualDuplicateMovements).mockResolvedValue([
      {
        signature: "sig_a",
        kind: SavingsMovementKind.MANUAL_DEPOSIT,
        amount: 80,
        currency: "EUR",
        occurredOn: "2026-05-10",
        note: null,
        keeperId: "mv_1",
        duplicateIds: ["mv_2"],
      },
      {
        signature: "sig_b",
        kind: SavingsMovementKind.MANUAL_WITHDRAWAL,
        amount: -25,
        currency: "EUR",
        occurredOn: "2026-05-12",
        note: "café",
        keeperId: "mv_4",
        duplicateIds: ["mv_5", "mv_6"],
      },
    ]);
    vi.mocked(deleteManualDuplicateMovements).mockResolvedValue({
      deletedCount: 3,
      skippedSystemKinds: 0,
      skippedNotFound: 0,
      balance: 105,
    });

    const result = await tools().dedupeSavingsMovements.execute!(
      { dryRun: false },
      execOpts,
    );

    expect(deleteManualDuplicateMovements).toHaveBeenCalledWith(USER_ID, [
      "mv_2",
      "mv_5",
      "mv_6",
    ]);
    expect(result).toMatchObject({
      ok: true,
      dryRun: false,
      applied: true,
      totalDuplicates: 3,
      deletedCount: 3,
      balance: 105,
    });
  });
});

describe("applyPrevMonthLeftover (agent tool, deficit modes)", () => {
  it("accepts coverFromSavings and propagates covered/remainingDebt", async () => {
    vi.mocked(applyPrevMonthLeftoverDecision).mockResolvedValue({
      type: "applied",
      mode: "coverFromSavings",
      leftover: -100,
      covered: 60,
      remainingDebt: 40,
    });
    const result = await tools().applyPrevMonthLeftover.execute!(
      { month: "2026-05", mode: "coverFromSavings" },
      execOpts,
    );
    expect(applyPrevMonthLeftoverDecision).toHaveBeenCalledWith(
      USER_ID,
      "2026-05",
      "coverFromSavings",
    );
    expect(result).toMatchObject({
      ok: true,
      applied: true,
      mode: "coverFromSavings",
      leftover: -100,
      covered: 60,
      remainingDebt: 40,
    });
  });

  it("accepts carryDebt and surfaces the remainingDebt", async () => {
    vi.mocked(applyPrevMonthLeftoverDecision).mockResolvedValue({
      type: "applied",
      mode: "carryDebt",
      leftover: -200,
      remainingDebt: 200,
    });
    const result = await tools().applyPrevMonthLeftover.execute!(
      { month: "2026-05", mode: "carryDebt" },
      execOpts,
    );
    expect(result).toMatchObject({
      ok: true,
      applied: true,
      mode: "carryDebt",
      leftover: -200,
      remainingDebt: 200,
    });
  });

  it("returns an error when the chosen mode does not match the sign of the leftover", async () => {
    vi.mocked(applyPrevMonthLeftoverDecision).mockResolvedValue({
      type: "modeMismatch",
      expected: "deficit",
    });
    const result = await tools().applyPrevMonthLeftover.execute!(
      { month: "2026-05", mode: "setAside" },
      execOpts,
    );
    expect(result).toMatchObject({
      error: expect.stringContaining("debt"),
    });
  });

  it("rejects unknown modes via the input schema", () => {
    const schema = (
      tools().applyPrevMonthLeftover as unknown as {
        inputSchema: import("zod").ZodTypeAny;
      }
    ).inputSchema;
    expect(schema.safeParse({ mode: "bogus" }).success).toBe(false);
    expect(schema.safeParse({ mode: "coverFromSavings" }).success).toBe(true);
    expect(schema.safeParse({ mode: "carryDebt" }).success).toBe(true);
  });
});
