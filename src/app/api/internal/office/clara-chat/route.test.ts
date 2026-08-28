import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockRequireToken = vi.fn();
const mockResolveUser = vi.fn();
const mockGenerate = vi.fn();

vi.mock("@/lib/office/idp-service-auth", () => ({
  requireIdpServiceToken: (...args: unknown[]) => mockRequireToken(...args),
  readOfficeUserLookup: (
    _req: unknown,
    body?: { sub?: string; email?: string; trefolioUserId?: string },
  ) => ({
    sub: body?.sub?.trim() || "",
    email: body?.email?.trim() || "",
    trefolioUserId: body?.trefolioUserId?.trim() || "",
  }),
}));
vi.mock("@/lib/office/resolve-office-user", () => ({
  resolveOfficeUser: (...args: unknown[]) => mockResolveUser(...args),
}));
vi.mock("@/lib/ai/run-expense-agent", () => ({
  generateExpenseAgentReply: (...args: unknown[]) => mockGenerate(...args),
}));
vi.mock("@/lib/seo", () => ({
  getSiteUrl: () => "https://clara.trefolio.com",
}));

import { POST } from "./route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/internal/office/clara-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/internal/office/clara-chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireToken.mockReturnValue(null);
    mockResolveUser.mockResolvedValue({ id: "clara-u1" });
    mockGenerate.mockResolvedValue({
      text: "Este mes te sobran 200 EUR.",
      chartImageUrls: [],
      usage: {},
      model: "test",
    });
  });

  it("returns 401 without a valid service token", async () => {
    mockRequireToken.mockReturnValue(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    );
    const res = await POST(
      makeRequest({ billingSource: "trefolio", message: "cuánto gasté" }),
    );
    expect(res.status).toBe(401);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("returns 404 with login URL when the user has no Clara account", async () => {
    mockResolveUser.mockResolvedValue(null);
    const res = await POST(
      makeRequest({
        billingSource: "trefolio",
        sub: "missing",
        email: "x@test.com",
        message: "cuánto gasté",
      }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.hasAccount).toBe(false);
    expect(body.loginUrl).toBe("https://clara.trefolio.com/login");
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("runs Clara without consultWarren and without consuming Clara quota", async () => {
    const res = await POST(
      makeRequest({
        billingSource: "trefolio",
        sub: "sub1",
        email: "a@test.com",
        message: "cuánto gasté este mes",
        language: "es",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.text).toBe("Este mes te sobran 200 EUR.");
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "clara-u1",
        source: "trefolio",
        omitConsultWarren: true,
        systemAppendix: expect.stringContaining("Do not call consultWarren"),
      }),
    );
  });
});
