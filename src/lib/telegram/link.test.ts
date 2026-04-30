import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  TELEGRAM_DEEP_LINK_START_MAX_LEN,
  TELEGRAM_LINK_TTL_MINUTES,
  buildTelegramDeepLink,
  generateTelegramLinkCode,
  signLinkToken,
  verifyLinkToken,
} from "./link";

describe("telegram/link", () => {
  const ORIGINAL_SECRET = process.env.TELEGRAM_LINK_TOKEN_SECRET;
  const ORIGINAL_USERNAME = process.env.TELEGRAM_BOT_USERNAME;

  beforeEach(() => {
    process.env.TELEGRAM_LINK_TOKEN_SECRET =
      "test-secret-needs-to-be-long-enough";
    process.env.TELEGRAM_BOT_USERNAME = "ClaraTestBot";
  });

  afterEach(() => {
    if (ORIGINAL_SECRET) {
      process.env.TELEGRAM_LINK_TOKEN_SECRET = ORIGINAL_SECRET;
    } else {
      delete process.env.TELEGRAM_LINK_TOKEN_SECRET;
    }
    if (ORIGINAL_USERNAME) {
      process.env.TELEGRAM_BOT_USERNAME = ORIGINAL_USERNAME;
    } else {
      delete process.env.TELEGRAM_BOT_USERNAME;
    }
  });

  describe("signLinkToken / verifyLinkToken", () => {
    it("round-trips a userId through sign + verify", () => {
      const token = signLinkToken("user-123");
      const result = verifyLinkToken(token);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.userId).toBe("user-123");
        expect(result.expSeconds).toBeGreaterThan(
          Math.floor(Date.now() / 1000),
        );
      }
    });

    it("uses a 15-minute TTL by default", () => {
      const before = Math.floor(Date.now() / 1000);
      const token = signLinkToken("user-123");
      const result = verifyLinkToken(token);
      if (!result.ok) throw new Error("expected ok");
      const ttl = result.expSeconds - before;
      // Allow a few seconds of drift between the two `Date.now()` calls.
      expect(ttl).toBeGreaterThanOrEqual(TELEGRAM_LINK_TTL_MINUTES * 60 - 5);
      expect(ttl).toBeLessThanOrEqual(TELEGRAM_LINK_TTL_MINUTES * 60 + 5);
    });

    it("rejects a token signed with a different secret", () => {
      const token = signLinkToken("user-123");
      process.env.TELEGRAM_LINK_TOKEN_SECRET =
        "completely-different-secret-now";
      const result = verifyLinkToken(token);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("signature");
    });

    it("rejects a tampered payload", () => {
      const token = signLinkToken("user-123");
      // Flip a character in the encoded payload.
      const [encoded, sig] = token.split("_");
      const tampered = `${encoded.slice(0, -2)}AA_${sig}`;
      const result = verifyLinkToken(tampered);
      expect(result.ok).toBe(false);
    });

    it("reports format errors for garbage tokens", () => {
      expect(verifyLinkToken("").ok).toBe(false);
      expect(verifyLinkToken("no-separator").ok).toBe(false);
    });

    it("reports expired when the deadline has passed", () => {
      const token = signLinkToken("user-123", -1);
      const result = verifyLinkToken(token);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("expired");
    });
  });

  describe("generateTelegramLinkCode", () => {
    it("fits Telegram deep-link start limit", () => {
      const code = generateTelegramLinkCode();
      expect(code.length).toBeGreaterThanOrEqual(12);
      expect(code.length).toBeLessThanOrEqual(TELEGRAM_DEEP_LINK_START_MAX_LEN);
      expect(/^[A-Za-z0-9_-]+$/.test(code)).toBe(true);
    });

    it("generates distinct values", () => {
      const a = generateTelegramLinkCode();
      const b = generateTelegramLinkCode();
      expect(a).not.toBe(b);
    });
  });

  describe("buildTelegramDeepLink", () => {
    it("uses the configured bot username", () => {
      const url = buildTelegramDeepLink("token123");
      expect(url).toBe("https://t.me/ClaraTestBot?start=token123");
    });

    it("strips a leading @ from the configured username", () => {
      process.env.TELEGRAM_BOT_USERNAME = "@ClaraTestBot";
      const url = buildTelegramDeepLink("token123");
      expect(url).toBe("https://t.me/ClaraTestBot?start=token123");
    });

    it("URL-encodes the token", () => {
      const url = buildTelegramDeepLink("a_b/c+d");
      expect(url).toBe(
        "https://t.me/ClaraTestBot?start=a_b%2Fc%2Bd",
      );
    });

    it("throws when start payload exceeds Telegram limit", () => {
      expect(() =>
        buildTelegramDeepLink("x".repeat(TELEGRAM_DEEP_LINK_START_MAX_LEN + 1)),
      ).toThrow(/exceeds/);
    });
  });
});
