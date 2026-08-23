import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOAuthState, verifyOAuthState } from "./oauth-state";

beforeEach(() => {
  process.env.BANK_SYNC_ENCRYPTION_KEY = "a".repeat(64);
});

afterEach(() => {
  delete process.env.BANK_SYNC_ENCRYPTION_KEY;
});

describe("oauth-state", () => {
  it("round-trips a signed state", () => {
    const raw = createOAuthState({
      userId: "user-1",
      institutionName: "Nordea",
      institutionCountry: "fi",
    });
    const payload = verifyOAuthState(raw);
    expect(payload.userId).toBe("user-1");
    expect(payload.institutionName).toBe("Nordea");
    expect(payload.institutionCountry).toBe("FI");
    expect(payload.nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it("rejects tampered payloads", () => {
    const raw = createOAuthState({
      userId: "user-1",
      institutionName: "Nordea",
      institutionCountry: "FI",
    });
    const [body, mac] = raw.split(".");
    const tampered = `${body.slice(0, -2)}xx.${mac}`;
    expect(() => verifyOAuthState(tampered)).toThrow("INVALID_OAUTH_STATE");
  });

  it("rejects expired state", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const raw = createOAuthState({
      userId: "user-1",
      institutionName: "Nordea",
      institutionCountry: "FI",
      now,
    });
    expect(() =>
      verifyOAuthState(raw, new Date("2026-01-01T00:20:00.000Z")),
    ).toThrow("EXPIRED_OAUTH_STATE");
  });
});
