import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "./crypto";

beforeEach(() => {
  process.env.BANK_SYNC_ENCRYPTION_KEY = "ab".repeat(32);
});

afterEach(() => {
  delete process.env.BANK_SYNC_ENCRYPTION_KEY;
});

describe("encryptSecret", () => {
  it("round-trips plaintext", () => {
    const cipher = encryptSecret("sess_123");
    expect(cipher).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(decryptSecret(cipher)).toBe("sess_123");
  });
});
