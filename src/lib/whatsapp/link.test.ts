import { describe, expect, it } from "vitest";

import { generateLinkCode, normalizePhone } from "./link";

describe("whatsapp/link", () => {
  describe("normalizePhone", () => {
    it("preserves a clean E.164 number", () => {
      expect(normalizePhone("+5491112345678")).toBe("+5491112345678");
    });

    it("strips formatting characters", () => {
      expect(normalizePhone(" +54 (911) 1234-5678 ")).toBe("+5491112345678");
    });

    it("adds a leading + when missing", () => {
      expect(normalizePhone("5491112345678")).toBe("+5491112345678");
    });

    it("rejects numbers that start with 0 or are too short/long", () => {
      expect(normalizePhone("+0491112345678")).toBeNull();
      expect(normalizePhone("+12345")).toBeNull();
      expect(normalizePhone("+1234567890123456")).toBeNull();
      expect(normalizePhone("garbage")).toBeNull();
    });
  });

  describe("generateLinkCode", () => {
    it("produces a zero-padded 6-digit numeric string", () => {
      for (let i = 0; i < 50; i++) {
        const code = generateLinkCode();
        expect(code).toMatch(/^\d{6}$/);
      }
    });
  });
});
