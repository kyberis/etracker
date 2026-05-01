import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createVerificationToken,
  verificationUrl,
  verifyVerificationToken,
} from "./verification-email";

describe("verification-email", () => {
  beforeEach(() => {
    vi.stubEnv("APP_SESSION_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret-please-do-not-use-in-prod");
    vi.stubEnv("APP_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "");
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

  it("APP_SESSION_SECRET takes precedence over NEXTAUTH_SECRET (trefolio parity)", async () => {
    vi.stubEnv("APP_SESSION_SECRET", "trefolio-aligned-secret");
    const token = await createVerificationToken("u_3", "carol@example.com");
    // NEXTAUTH_SECRET is still set to the default but should be ignored.
    const payload = await verifyVerificationToken(token);
    expect(payload).toEqual({ userId: "u_3", email: "carol@example.com" });
    // Removing APP_SESSION_SECRET makes the token unverifiable because the
    // fallback NEXTAUTH_SECRET signs differently.
    vi.stubEnv("APP_SESSION_SECRET", "");
    expect(await verifyVerificationToken(token)).toBeNull();
  });

  it("encodes the token in the verification URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://clara.example");
    const token = await createVerificationToken("u_2", "bob@example.com");
    const url = verificationUrl(token);
    expect(url.startsWith("https://clara.example/api/auth/verify-email?token=")).toBe(true);
    expect(url).toContain(encodeURIComponent(token));
  });

  it("APP_BASE_URL takes precedence over NEXT_PUBLIC_APP_URL / NEXTAUTH_URL", async () => {
    vi.stubEnv("APP_BASE_URL", "https://clara.trefolio.com/");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://wrong.example");
    vi.stubEnv("NEXTAUTH_URL", "https://also-wrong.example");
    const token = await createVerificationToken("u_4", "dave@example.com");
    const url = verificationUrl(token);
    // Trailing slash from APP_BASE_URL must be stripped to avoid `//api/...`.
    expect(url.startsWith("https://clara.trefolio.com/api/auth/verify-email?token=")).toBe(true);
  });
});
