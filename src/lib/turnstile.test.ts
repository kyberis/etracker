import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getClientIp, verifyTurnstileToken } from "./turnstile";

describe("verifyTurnstileToken", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("passes through in development without hitting Cloudflare", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await verifyTurnstileToken(undefined, "1.2.3.4", "example.com")).toBe(
      true,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("passes through when TURNSTILE_DISABLED=1", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_DISABLED", "1");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "kept");
    expect(await verifyTurnstileToken(undefined, "1.2.3.4", "example.com")).toBe(
      true,
    );
  });

  it("passes through on localhost even in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "kept");
    vi.stubEnv("TURNSTILE_DISABLED", "");
    expect(await verifyTurnstileToken(undefined, "127.0.0.1", "localhost:3000")).toBe(
      true,
    );
  });

  it("treats missing secret as a no-op so self-hosters aren't blocked", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("TURNSTILE_DISABLED", "");
    expect(await verifyTurnstileToken(undefined, "1.2.3.4", "clara.example")).toBe(
      true,
    );
  });

  it("rejects when configured but no token is provided", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("TURNSTILE_DISABLED", "");
    expect(await verifyTurnstileToken(undefined, "1.2.3.4", "clara.example")).toBe(
      false,
    );
  });

  it("calls siteverify and returns its success flag", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("TURNSTILE_DISABLED", "");
    const fetchSpy = vi.fn().mockResolvedValue({
      json: async () => ({ success: true }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const ok = await verifyTurnstileToken("token-from-form", "1.2.3.4", "clara.example");
    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns false when Cloudflare reports failure", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("TURNSTILE_DISABLED", "");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ success: false }) }),
    );
    expect(await verifyTurnstileToken("bad", "1.2.3.4", "clara.example")).toBe(
      false,
    );
  });

  it("returns false on network errors instead of failing open", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("TURNSTILE_DISABLED", "");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    expect(await verifyTurnstileToken("token", "1.2.3.4", "clara.example")).toBe(
      false,
    );
  });
});

describe("getClientIp", () => {
  it("uses the first entry of x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" });
    expect(getClientIp(headers)).toBe("1.1.1.1");
  });

  it("falls back to x-real-ip", () => {
    const headers = new Headers({ "x-real-ip": "3.3.3.3" });
    expect(getClientIp(headers)).toBe("3.3.3.3");
  });

  it("returns empty string when no header is present", () => {
    expect(getClientIp(new Headers())).toBe("");
  });
});
