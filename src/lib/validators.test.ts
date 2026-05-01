import { describe, expect, it } from "vitest";

import {
  carryoverDecisionSchema,
  currencySchema,
  expenseSchema,
  monthlySavingsContributionSchema,
  onboardingSchema,
  savingsMovementCreateSchema,
  savingsMovementUpdateSchema,
  yearParamSchema,
} from "./validators";

describe("validators", () => {
  describe("expenseSchema", () => {
    const base = {
      name: "Netflix",
      amount: 19.99,
      bankId: "bnk_1",
      isRecurring: true,
      startMonth: "2026-01",
      category: "SUSCRIPCIONES",
    } as const;

    it("accepts a valid recurring expense without endMonth", () => {
      expect(() => expenseSchema.parse(base)).not.toThrow();
    });

    it("accepts a recurring expense with a later endMonth", () => {
      expect(() =>
        expenseSchema.parse({ ...base, endMonth: "2026-06" }),
      ).not.toThrow();
    });

    it("rejects when endMonth precedes startMonth", () => {
      expect(() =>
        expenseSchema.parse({ ...base, endMonth: "2025-12" }),
      ).toThrow(/End month must be after start month/);
    });

    it("rejects endMonth on a one-off expense", () => {
      expect(() =>
        expenseSchema.parse({
          ...base,
          isRecurring: false,
          endMonth: "2026-06",
        }),
      ).toThrow(/One-off expenses cannot have an end month/);
    });

    it("requires a positive amount", () => {
      expect(() => expenseSchema.parse({ ...base, amount: 0 })).toThrow();
      expect(() => expenseSchema.parse({ ...base, amount: -5 })).toThrow();
    });
  });

  describe("currencySchema", () => {
    it("normalises lower-case codes to upper-case", () => {
      expect(currencySchema.parse("usd")).toBe("USD");
      expect(currencySchema.parse(" eur ")).toBe("EUR");
    });

    it("rejects non 3-letter codes", () => {
      expect(() => currencySchema.parse("US")).toThrow();
      expect(() => currencySchema.parse("USDX")).toThrow();
      expect(() => currencySchema.parse("12 ")).toThrow();
    });
  });

  describe("onboardingSchema", () => {
    it("accepts a partial step save with just the name", () => {
      const parsed = onboardingSchema.parse({ name: " Marcos  " });
      expect(parsed.name).toBe("Marcos");
      expect(parsed.complete).toBeUndefined();
    });

    it("upper-cases the country code and currency", () => {
      const parsed = onboardingSchema.parse({
        country: "ar",
        primaryCurrency: " ars ",
      });
      expect(parsed.country).toBe("AR");
      expect(parsed.primaryCurrency).toBe("ARS");
    });

    it("rejects unknown usage reasons", () => {
      expect(() =>
        onboardingSchema.parse({ usageReasons: ["personal", "evil"] }),
      ).toThrow();
    });

    it("accepts an empty usageReasons array (cleared chips)", () => {
      const parsed = onboardingSchema.parse({ usageReasons: [], complete: true });
      expect(parsed.usageReasons).toEqual([]);
      expect(parsed.complete).toBe(true);
    });

    it("rejects an empty body", () => {
      expect(() => onboardingSchema.parse({})).toThrow(/Nada para actualizar/);
    });

    it("rejects a 1-letter country code", () => {
      expect(() => onboardingSchema.parse({ country: "a" })).toThrow();
    });
  });

  describe("yearParamSchema", () => {
    it("coerces strings to int and bounds them", () => {
      expect(yearParamSchema.parse({ year: "2026" }).year).toBe(2026);
      expect(() => yearParamSchema.parse({ year: 1969 })).toThrow();
      expect(() => yearParamSchema.parse({ year: 2101 })).toThrow();
    });
  });

  describe("carryoverDecisionSchema", () => {
    it("accepts the four supported modes", () => {
      for (const mode of [
        "addToIncome",
        "setAside",
        "coverFromSavings",
        "carryDebt",
      ] as const) {
        expect(carryoverDecisionSchema.safeParse({ mode }).success).toBe(true);
      }
    });

    it("rejects unknown modes", () => {
      expect(carryoverDecisionSchema.safeParse({ mode: "ignore" }).success).toBe(
        false,
      );
    });
  });

  describe("savingsMovementCreateSchema", () => {
    it("requires a positive amount and a write-allowed kind", () => {
      expect(
        savingsMovementCreateSchema.safeParse({
          kind: "MANUAL_DEPOSIT",
          amount: 50,
        }).success,
      ).toBe(true);

      expect(
        savingsMovementCreateSchema.safeParse({
          kind: "MANUAL_DEPOSIT",
          amount: 0,
        }).success,
      ).toBe(false);

      // System kinds are not allowed via the create endpoint.
      expect(
        savingsMovementCreateSchema.safeParse({
          kind: "DEBT_COVERAGE",
          amount: 50,
        }).success,
      ).toBe(false);
      expect(
        savingsMovementCreateSchema.safeParse({
          kind: "MONTHLY_CONTRIBUTION",
          amount: 50,
        }).success,
      ).toBe(false);
    });

    it("validates occurredOn as yyyy-MM-dd", () => {
      expect(
        savingsMovementCreateSchema.safeParse({
          kind: "MANUAL_WITHDRAWAL",
          amount: 5,
          occurredOn: "2026/05/01",
        }).success,
      ).toBe(false);
      expect(
        savingsMovementCreateSchema.safeParse({
          kind: "MANUAL_WITHDRAWAL",
          amount: 5,
          occurredOn: "2026-05-01",
        }).success,
      ).toBe(true);
    });
  });

  describe("savingsMovementUpdateSchema", () => {
    it("requires at least one field", () => {
      expect(savingsMovementUpdateSchema.safeParse({}).success).toBe(false);
    });

    it("accepts partial updates and an explicit null note", () => {
      expect(savingsMovementUpdateSchema.safeParse({ amount: 5 }).success).toBe(
        true,
      );
      expect(
        savingsMovementUpdateSchema.safeParse({ note: null }).success,
      ).toBe(true);
      expect(
        savingsMovementUpdateSchema.safeParse({
          occurredOn: "2026-05-01",
        }).success,
      ).toBe(true);
    });
  });

  describe("monthlySavingsContributionSchema", () => {
    it("requires a positive amount", () => {
      expect(
        monthlySavingsContributionSchema.safeParse({ amount: 50 }).success,
      ).toBe(true);
      expect(
        monthlySavingsContributionSchema.safeParse({ amount: 0 }).success,
      ).toBe(false);
      expect(
        monthlySavingsContributionSchema.safeParse({ amount: -1 }).success,
      ).toBe(false);
    });
  });
});
