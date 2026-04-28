import { describe, expect, it } from "vitest";

import {
  formatMonthKey,
  isCurrentMonthKey,
  monthRange,
  parseMonthKey,
  toMonthStart,
} from "./months";

describe("months", () => {
  describe("parseMonthKey / formatMonthKey", () => {
    it("round-trips a yyyy-MM string", () => {
      const date = parseMonthKey("2026-04");
      expect(date.toISOString()).toBe("2026-04-01T00:00:00.000Z");
      expect(formatMonthKey(date)).toBe("2026-04");
    });

    it("rejects malformed input", () => {
      expect(() => parseMonthKey("2026-4")).toThrow(/Invalid month format/);
      expect(() => parseMonthKey("not-a-month")).toThrow();
      expect(() => parseMonthKey("2026-13")).toThrow();
      expect(() => parseMonthKey("2026-00")).toThrow();
    });
  });

  describe("toMonthStart", () => {
    it("normalizes any UTC instant to the first day of its month", () => {
      const mid = new Date(Date.UTC(2026, 3, 17, 12, 34, 56));
      expect(toMonthStart(mid).toISOString()).toBe("2026-04-01T00:00:00.000Z");
    });
  });

  describe("monthRange", () => {
    it("returns N consecutive months starting at the given date", () => {
      const start = parseMonthKey("2026-04");
      const range = monthRange(start, 3).map(formatMonthKey);
      expect(range).toEqual(["2026-04", "2026-05", "2026-06"]);
    });
  });

  describe("isCurrentMonthKey", () => {
    it("matches today's UTC month", () => {
      const today = new Date();
      const expected = `${today.getUTCFullYear()}-${String(
        today.getUTCMonth() + 1,
      ).padStart(2, "0")}`;
      expect(isCurrentMonthKey(expected)).toBe(true);
      expect(isCurrentMonthKey("1999-01")).toBe(false);
    });
  });
});
