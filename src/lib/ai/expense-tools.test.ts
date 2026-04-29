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
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    monthRecord: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/cache/banks", () => ({
  getBanksCached: vi.fn(),
  invalidateBanksCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/year-timeline-data", () => ({
  expireYearTimeline: vi.fn().mockResolvedValue(undefined),
}));

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

const USER_ID = "user_1";
const OTHER_USER = "user_2";

/** ai-sdk's tool().execute requires a 2nd `options` arg we don't use here. */
const execOpts = {} as never;

function tools() {
  return buildExpenseTools(USER_ID);
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

    expect(result).toEqual({ error: 'Ya existe un banco llamado "Galicia".' });
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
    expect(result).toEqual({ error: "El banco indicado no existe." });
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

  it("returns 'nada para actualizar' when no fields are provided", async () => {
    vi.mocked(db.bank.findFirst).mockResolvedValue({ id: "bank_1" } as never);

    const result = await tools().updateBank.execute!({ id: "bank_1" }, execOpts);

    expect(result).toEqual({ error: "Nada para actualizar." });
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

    expect(result).toEqual({ error: "El banco indicado no existe." });
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
    expect(result).toEqual({ error: "La plantilla indicada no existe." });
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
      error: "Las plantillas puntuales no pueden tener endMonth.",
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
    expect(result).toEqual({ error: "Línea no encontrada." });
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
