import { OccurrenceDateSource } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createExpense = vi.fn();
const createIncome = vi.fn();
const findUser = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: (...args: unknown[]) => findUser(...args) },
    monthExpenseLine: { create: (...args: unknown[]) => createExpense(...args) },
    monthIncomeLine: { create: (...args: unknown[]) => createIncome(...args) },
  },
}));

vi.mock("@/lib/fx/rates", () => ({
  FxUnavailableError: class extends Error {},
  convertToPrimary: vi.fn(async (input: { amount: number; currency: string }) => ({
    amount: input.amount,
    currency: input.currency,
    fxRate: 1,
    amountConverted: input.amount,
  })),
}));

vi.mock("@/lib/month-line-bucket", () => ({
  resolveMonthRecordId: vi.fn(async () => "month-1"),
}));

vi.mock("@/lib/year-timeline-data", () => ({
  expireYearTimeline: vi.fn(),
}));

import { importBankExpenseLine, importBankIncomeLine } from "./import-line";

beforeEach(() => {
  vi.clearAllMocks();
  findUser.mockResolvedValue({ primaryCurrency: "EUR" });
});

describe("import-line", () => {
  it("creates an expense as ARTIFACT + paid", async () => {
    createExpense.mockResolvedValueOnce({ id: "exp-1" });
    const result = await importBankExpenseLine({
      userId: "u1",
      bankId: "b1",
      name: "Cafe",
      amount: 12.5,
      currency: "EUR",
      occurredOn: new Date("2026-08-20T00:00:00.000Z"),
      category: "ALIMENTACION",
    });
    expect(result).toEqual({
      ok: true,
      duplicate: false,
      lineId: "exp-1",
      lineType: "expense",
    });
    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          occurredOnSource: OccurrenceDateSource.ARTIFACT,
          paid: true,
          bankId: "b1",
        }),
      }),
    );
  });

  it("creates an income as ARTIFACT + received", async () => {
    createIncome.mockResolvedValueOnce({ id: "inc-1" });
    const result = await importBankIncomeLine({
      userId: "u1",
      bankId: "b1",
      name: "Salary",
      amount: 1500,
      currency: "EUR",
      occurredOn: new Date("2026-08-19T00:00:00.000Z"),
      category: "SUELDO",
    });
    expect(result).toEqual({
      ok: true,
      duplicate: false,
      lineId: "inc-1",
      lineType: "income",
    });
  });
});
