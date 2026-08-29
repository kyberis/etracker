import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockRequireToken = vi.fn();
const mockEnsure = vi.fn();

vi.mock("@/lib/office/idp-service-auth", () => ({
  requireIdpServiceToken: (...args: unknown[]) => mockRequireToken(...args),
  readOfficeUserLookup: (
    _req: unknown,
    body?: { sub?: string; email?: string; trefolioUserId?: string },
  ) => ({
    sub: body?.sub?.trim() || "",
    email: body?.email?.trim().toLowerCase() || "",
    trefolioUserId: body?.trefolioUserId?.trim() || "",
  }),
}));

vi.mock("@/lib/office/ensure-office-user", () => ({
  ensureOfficeUser: (...args: unknown[]) => mockEnsure(...args),
}));

import { POST } from "./route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/internal/office/ensure-user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/internal/office/ensure-user", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireToken.mockReturnValue(null);
    mockEnsure.mockResolvedValue({
      ok: true,
      created: true,
      user: { id: "clara-u1", email: "u@test.com", idpSub: "sub-1", name: null },
    });
  });

  it("returns 401 without a valid service token", async () => {
    mockRequireToken.mockReturnValue(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    );
    const res = await POST(makeRequest({ sub: "s", email: "a@b.com" }));
    expect(res.status).toBe(401);
    expect(mockEnsure).not.toHaveBeenCalled();
  });

  it("provisions and returns created payload", async () => {
    const res = await POST(
      makeRequest({
        sub: "sub-1",
        email: "u@test.com",
        trefolioUserId: "t1",
        name: "Ada",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      created: true,
      id: "clara-u1",
      idpSub: "sub-1",
      email: "u@test.com",
    });
    expect(mockEnsure).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: "sub-1",
        email: "u@test.com",
        name: "Ada",
      }),
    );
  });

  it("maps ensure errors to HTTP status", async () => {
    mockEnsure.mockResolvedValue({ ok: false, error: "missing_sub" });
    expect((await POST(makeRequest({ email: "a@b.com" }))).status).toBe(400);

    mockEnsure.mockResolvedValue({ ok: false, error: "inactive_user" });
    expect(
      (await POST(makeRequest({ sub: "s", email: "a@b.com" }))).status,
    ).toBe(403);

    mockEnsure.mockResolvedValue({ ok: false, error: "email_conflict" });
    expect(
      (await POST(makeRequest({ sub: "s", email: "a@b.com" }))).status,
    ).toBe(409);
  });
});
