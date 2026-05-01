import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Carryover-decision tests for the negative leftover (deficit) paths.
 *
 * These tests focus on the new modes added by the savings feature:
 *   - `coverFromSavings` — pulls from the savings pile via the savings service
 *     and writes the remaining debt as a negative `carryoverFromPrev`.
 *   - `carryDebt` — does not touch the pile; the full deficit becomes the
 *     negative `carryoverFromPrev`.
 *
 * We also verify mode/sign mismatches and the idempotent "already decided"
 * short-circuit.
 */

const { mockDb, mockSavings } = vi.hoisted(() => {
  return {
    mockDb: {
      monthRecord: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockDb)),
    },
    mockSavings: {
      coverMonthDebt: vi.fn(),
      recordSavingsMovement: vi.fn(),
    },
  };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/savings", () => ({
  coverMonthDebt: mockSavings.coverMonthDebt,
  recordSavingsMovement: mockSavings.recordSavingsMovement,
}));

import {
  applyPrevMonthLeftoverDecision,
  getPrevMonthBalance,
} from "./month-bucket";

const USER = "user_1";
const MONTH_KEY = "2026-05";
const PREV_MONTH_RECORD_ID = "mr_prev";

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.user.findUnique.mockResolvedValue({ primaryCurrency: "EUR" });
  mockDb.monthRecord.update.mockResolvedValue({});
});

afterEach(() => {
  vi.resetAllMocks();
});

function mockCurrentMonthRecord({ decided = false } = {}) {
  mockDb.monthRecord.findFirst.mockResolvedValueOnce({
    id: "mr_current",
    carryoverDecidedAt: decided ? new Date() : null,
  });
}

function mockPrevMonthBalance({
  income,
  carryover,
  paidLines,
}: {
  income: number;
  carryover: number;
  paidLines: number[];
}) {
  // The second call to findFirst comes from getPrevMonthBalance.
  mockDb.monthRecord.findFirst.mockResolvedValueOnce({
    id: PREV_MONTH_RECORD_ID,
    month: new Date(Date.UTC(2026, 3, 1)),
    income: new Prisma.Decimal(income.toFixed(2)),
    carryoverFromPrev: new Prisma.Decimal(carryover.toFixed(2)),
    lines: paidLines.map((amount) => ({
      amountConverted: new Prisma.Decimal(amount.toFixed(2)),
      paid: true,
    })),
  });
}

describe("getPrevMonthBalance", () => {
  it("returns the signed balance (income + carryover − paid)", async () => {
    mockDb.monthRecord.findFirst.mockResolvedValueOnce({
      id: "mr_prev",
      month: new Date(Date.UTC(2026, 3, 1)),
      income: new Prisma.Decimal("1000"),
      carryoverFromPrev: new Prisma.Decimal("0"),
      lines: [
        { amountConverted: new Prisma.Decimal("400"), paid: true },
        { amountConverted: new Prisma.Decimal("300"), paid: true },
        { amountConverted: new Prisma.Decimal("999"), paid: false },
      ],
    });
    const result = await getPrevMonthBalance(USER, new Date(Date.UTC(2026, 4, 1)));
    expect(result).toEqual({
      prevMonthKey: "2026-04",
      prevMonthRecordId: "mr_prev",
      amount: 300,
    });
  });

  it("returns negative balance when paid > available", async () => {
    mockDb.monthRecord.findFirst.mockResolvedValueOnce({
      id: "mr_prev",
      month: new Date(Date.UTC(2026, 3, 1)),
      income: new Prisma.Decimal("500"),
      carryoverFromPrev: new Prisma.Decimal("0"),
      lines: [{ amountConverted: new Prisma.Decimal("750"), paid: true }],
    });
    const result = await getPrevMonthBalance(USER, new Date(Date.UTC(2026, 4, 1)));
    expect(result?.amount).toBe(-250);
  });
});

describe("applyPrevMonthLeftoverDecision — short-circuits", () => {
  it("returns noRecord when the target month is not configured", async () => {
    mockDb.monthRecord.findFirst.mockResolvedValueOnce(null);
    const result = await applyPrevMonthLeftoverDecision(
      USER,
      MONTH_KEY,
      "carryDebt",
    );
    expect(result).toEqual({ type: "noRecord" });
    expect(mockDb.monthRecord.update).not.toHaveBeenCalled();
  });

  it("returns alreadyDecided when carryoverDecidedAt is set", async () => {
    mockCurrentMonthRecord({ decided: true });
    const result = await applyPrevMonthLeftoverDecision(
      USER,
      MONTH_KEY,
      "carryDebt",
    );
    expect(result).toEqual({ type: "alreadyDecided" });
    expect(mockDb.monthRecord.update).not.toHaveBeenCalled();
  });

  it("seals the decision when there is no leftover", async () => {
    mockCurrentMonthRecord();
    mockDb.monthRecord.findFirst.mockResolvedValueOnce(null); // no prev record
    const result = await applyPrevMonthLeftoverDecision(
      USER,
      MONTH_KEY,
      "carryDebt",
    );
    expect(result).toEqual({ type: "noLeftover" });
    expect(mockDb.monthRecord.update).toHaveBeenCalledWith({
      where: { id: "mr_current" },
      data: { carryoverDecidedAt: expect.any(Date) },
    });
  });
});

describe("applyPrevMonthLeftoverDecision — modeMismatch", () => {
  it("rejects coverFromSavings when prev month closed in surplus", async () => {
    mockCurrentMonthRecord();
    mockPrevMonthBalance({ income: 1000, carryover: 0, paidLines: [400] });
    const result = await applyPrevMonthLeftoverDecision(
      USER,
      MONTH_KEY,
      "coverFromSavings",
    );
    expect(result).toEqual({ type: "modeMismatch", expected: "leftover" });
    expect(mockSavings.coverMonthDebt).not.toHaveBeenCalled();
    expect(mockDb.monthRecord.update).not.toHaveBeenCalled();
  });

  it("rejects setAside when prev month closed in deficit", async () => {
    mockCurrentMonthRecord();
    mockPrevMonthBalance({ income: 100, carryover: 0, paidLines: [400] });
    const result = await applyPrevMonthLeftoverDecision(
      USER,
      MONTH_KEY,
      "setAside",
    );
    expect(result).toEqual({ type: "modeMismatch", expected: "deficit" });
    expect(mockSavings.recordSavingsMovement).not.toHaveBeenCalled();
  });
});

describe("applyPrevMonthLeftoverDecision — carryDebt", () => {
  it("writes the full deficit as a negative carryoverFromPrev and seals the decision", async () => {
    mockCurrentMonthRecord();
    mockPrevMonthBalance({ income: 100, carryover: 0, paidLines: [350] });
    const result = await applyPrevMonthLeftoverDecision(
      USER,
      MONTH_KEY,
      "carryDebt",
    );
    expect(result).toMatchObject({
      type: "applied",
      mode: "carryDebt",
      leftover: -250,
      remainingDebt: 250,
    });
    expect(mockSavings.coverMonthDebt).not.toHaveBeenCalled();
    expect(mockDb.monthRecord.update).toHaveBeenCalledWith({
      where: { id: "mr_current" },
      data: {
        carryoverFromPrev: expect.objectContaining({ s: -1 }),
        carryoverDecidedAt: expect.any(Date),
      },
    });
    const updateCall = mockDb.monthRecord.update.mock.calls[0][0];
    expect(Number(updateCall.data.carryoverFromPrev)).toBe(-250);
  });
});

describe("applyPrevMonthLeftoverDecision — coverFromSavings", () => {
  it("delegates to the savings service and zeroes the carryover when fully covered", async () => {
    mockCurrentMonthRecord();
    mockPrevMonthBalance({ income: 100, carryover: 0, paidLines: [180] });
    mockSavings.coverMonthDebt.mockResolvedValueOnce({
      covered: 80,
      remainingDebt: 0,
      balance: 200,
    });
    const result = await applyPrevMonthLeftoverDecision(
      USER,
      MONTH_KEY,
      "coverFromSavings",
    );
    expect(mockSavings.coverMonthDebt).toHaveBeenCalledWith({
      userId: USER,
      monthRecordId: PREV_MONTH_RECORD_ID,
      deficit: expect.any(Prisma.Decimal),
      currency: "EUR",
    });
    const arg = mockSavings.coverMonthDebt.mock.calls[0][0];
    expect(Number(arg.deficit)).toBe(80);
    expect(result).toMatchObject({
      type: "applied",
      mode: "coverFromSavings",
      leftover: -80,
      covered: 80,
      remainingDebt: 0,
    });
    const updateCall = mockDb.monthRecord.update.mock.calls[0][0];
    expect(Number(updateCall.data.carryoverFromPrev)).toBe(-0);
  });

  it("leaves the remainingDebt as a negative carryover when the pile is short", async () => {
    mockCurrentMonthRecord();
    mockPrevMonthBalance({ income: 0, carryover: 0, paidLines: [100] });
    mockSavings.coverMonthDebt.mockResolvedValueOnce({
      covered: 30,
      remainingDebt: 70,
      balance: 0,
    });
    const result = await applyPrevMonthLeftoverDecision(
      USER,
      MONTH_KEY,
      "coverFromSavings",
    );
    expect(result).toMatchObject({
      type: "applied",
      mode: "coverFromSavings",
      leftover: -100,
      covered: 30,
      remainingDebt: 70,
    });
    const updateCall = mockDb.monthRecord.update.mock.calls[0][0];
    expect(Number(updateCall.data.carryoverFromPrev)).toBe(-70);
  });
});

describe("applyPrevMonthLeftoverDecision — setAside (positive leftover regression)", () => {
  it("writes a CARRYOVER_DEPOSIT via the savings service and seals the decision", async () => {
    mockCurrentMonthRecord();
    mockPrevMonthBalance({ income: 1000, carryover: 0, paidLines: [400] });
    mockSavings.recordSavingsMovement.mockResolvedValueOnce({
      movement: { id: "mv_x" } as never,
      balance: 600,
    });
    const result = await applyPrevMonthLeftoverDecision(
      USER,
      MONTH_KEY,
      "setAside",
    );
    expect(mockSavings.recordSavingsMovement).toHaveBeenCalled();
    const arg = mockSavings.recordSavingsMovement.mock.calls[0][0];
    expect(arg.kind).toBe("CARRYOVER_DEPOSIT");
    expect(Number(arg.amount)).toBe(600);
    expect(result).toMatchObject({
      type: "applied",
      mode: "setAside",
      leftover: 600,
    });
  });
});
