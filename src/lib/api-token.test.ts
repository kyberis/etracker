import { describe, expect, it } from "vitest";

import {
  TOKEN_PREFIX,
  extractBearer,
  generateToken,
  hashToken,
  safeEqualHash,
} from "@/lib/api-token";

describe("api-token", () => {
  describe("generateToken", () => {
    it("returns a plaintext token with the canonical prefix", () => {
      const { plaintext } = generateToken();
      expect(plaintext.startsWith(TOKEN_PREFIX)).toBe(true);
      // 32 random bytes encoded as hex = 64 chars + the prefix.
      expect(plaintext.length).toBe(TOKEN_PREFIX.length + 64);
    });

    it("returns a hash that matches `hashToken(plaintext)`", () => {
      const { plaintext, tokenHash } = generateToken();
      expect(tokenHash).toBe(hashToken(plaintext));
      expect(tokenHash).toHaveLength(64);
    });

    it("includes a UI-safe visible prefix", () => {
      const { plaintext, prefix } = generateToken();
      expect(plaintext.startsWith(prefix)).toBe(true);
      expect(prefix.startsWith(TOKEN_PREFIX)).toBe(true);
    });

    it("never collides on consecutive calls", () => {
      const a = generateToken();
      const b = generateToken();
      expect(a.plaintext).not.toBe(b.plaintext);
      expect(a.tokenHash).not.toBe(b.tokenHash);
    });
  });

  describe("hashToken", () => {
    it("is deterministic and case-sensitive", () => {
      expect(hashToken("hello")).toBe(hashToken("hello"));
      expect(hashToken("hello")).not.toBe(hashToken("Hello"));
    });
  });

  describe("safeEqualHash", () => {
    it("returns true for equal hex hashes of the same length", () => {
      const a = hashToken("same");
      const b = hashToken("same");
      expect(safeEqualHash(a, b)).toBe(true);
    });

    it("returns false for different hex hashes", () => {
      expect(safeEqualHash(hashToken("a"), hashToken("b"))).toBe(false);
    });

    it("returns false on length mismatch (without throwing)", () => {
      expect(safeEqualHash("ab", "abcd")).toBe(false);
    });
  });

  describe("extractBearer", () => {
    function headers(map: Record<string, string>): Headers {
      return new Headers(map);
    }

    it("returns the token when the Authorization header is `Bearer …`", () => {
      expect(extractBearer(headers({ authorization: "Bearer foo123" }))).toBe(
        "foo123",
      );
    });

    it("is case-insensitive on the scheme", () => {
      expect(extractBearer(headers({ authorization: "bearer foo" }))).toBe("foo");
    });

    it("returns null for non-bearer schemes", () => {
      expect(extractBearer(headers({ authorization: "Basic abcdef" }))).toBeNull();
    });

    it("returns null when the header is missing or empty", () => {
      expect(extractBearer(headers({}))).toBeNull();
      expect(extractBearer(headers({ authorization: "Bearer    " }))).toBeNull();
    });
  });
});
