import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchWarrenReply,
  getTrefolioSignupUrl,
} from "./warren-client";

describe("getTrefolioSignupUrl", () => {
  afterEach(() => {
    delete process.env.TREFOLIO_PUBLIC_URL;
  });

  it("defaults to production signup", () => {
    expect(getTrefolioSignupUrl()).toBe("https://trefolio.com/signup");
  });

  it("honours TREFOLIO_PUBLIC_URL", () => {
    process.env.TREFOLIO_PUBLIC_URL = "https://trefolio-dev.com/";
    expect(getTrefolioSignupUrl()).toBe("https://trefolio-dev.com/signup");
  });
});

describe("fetchWarrenReply", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("maps 404 to no_trefolio_account with signup URL", async () => {
    vi.stubEnv("TREFOLIO_BASE_URL", "https://trefolio.com");
    vi.stubEnv("IDP_SERVICE_TOKEN", "svc");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ hasAccount: false, signupUrl: "https://trefolio.com/signup" }),
          { status: 404 },
        ),
      ),
    );

    const result = await fetchWarrenReply({
      idpSub: "sub-1",
      email: "a@test.com",
      message: "mis inversiones",
    });
    expect(result).toEqual({
      available: false,
      reason: "no_trefolio_account",
      signupUrl: "https://trefolio.com/signup",
      note: undefined,
    });
  });

  it("returns a live Warren reply on 200", async () => {
    vi.stubEnv("TREFOLIO_BASE_URL", "https://trefolio.com");
    vi.stubEnv("IDP_SERVICE_TOKEN", "svc");
    vi.stubEnv("NODE_ENV", "test");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ available: true, text: "Tenés AAPL." }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchWarrenReply({
      idpSub: "sub-1",
      email: "a@test.com",
      message: "mis inversiones",
      language: "es",
    });
    expect(result).toEqual({ available: true, text: "Tenés AAPL.", note: undefined });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://trefolio.com/api/internal/office/warren-chat",
      expect.objectContaining({
        method: "POST",
      }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.billingSource).toBe("clara");
  });

  it("uses the development stub when trefolio is not configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.TREFOLIO_BASE_URL;
    delete process.env.IDP_SERVICE_TOKEN;

    const result = await fetchWarrenReply({
      email: "a@test.com",
      message: "hi",
    });
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.note).toBe("Dev stub");
    }
  });
});
