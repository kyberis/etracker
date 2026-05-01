import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createVerificationToken,
  verificationUrl,
  verifyVerificationToken,
} from "./verification-email";

describe("verification-email", () => {
  beforeEach(() => {
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret-please-do-not-use-in-prod");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips a token and recovers userId + email", async () => {
    const token = await createVerificationToken("u_1", "alice@example.com");
    const payload = await verifyVerificationToken(token);
    expect(payload).toEqual({ userId: "u_1", email: "alice@example.com" });
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createVerificationToken("u_1", "alice@example.com");
    vi.stubEnv("NEXTAUTH_SECRET", "different-secret");
    expect(await verifyVerificationToken(token)).toBeNull();
  });

  it("rejects a malformed token", async () => {
    expect(await verifyVerificationToken("not-a-jwt")).toBeNull();
  });

  it("encodes the token in the verification URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://clara.example");
    const token = await createVerificationToken("u_2", "bob@example.com");
    const url = verificationUrl(token);
    expect(url.startsWith("https://clara.example/api/auth/verify-email?token=")).toBe(true);
    expect(url).toContain(encodeURIComponent(token));
  });
});
