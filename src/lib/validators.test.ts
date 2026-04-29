import { describe, expect, it } from "vitest";

import {
  currencySchema,
  expenseSchema,
  onboardingSchema,
  whatsappLinkStartSchema,
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

  describe("whatsappLinkStartSchema", () => {
    it("strips dashes/parens/spaces from a valid international number", () => {
      const parsed = whatsappLinkStartSchema.parse({
        phone: " +54 (911) 1234-5678 ",
      });
      expect(parsed.phone).toBe("+5491112345678");
    });

    it("rejects local-format numbers", () => {
      expect(() =>
        whatsappLinkStartSchema.parse({ phone: "1145678901" }),
      ).toThrow();
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
});
