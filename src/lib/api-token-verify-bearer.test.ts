import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIntrospect = vi.hoisted(() => vi.fn());
const mockUserFindFirst = vi.hoisted(() => vi.fn());
const mockApiFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/accounts-pat-introspect", () => ({
  isTfpPatToken: (s: string) => String(s).trim().startsWith("tfp_pat_"),
  introspectTfpPat: (t: string) => mockIntrospect(t),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findFirst: (...args: unknown[]) => mockUserFindFirst(...args),
    },
    apiToken: {
      findUnique: (...args: unknown[]) => mockApiFindUnique(...args),
      update: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

import { verifyBearerToken } from "./api-token";

describe("verifyBearerToken (unified tfp_pat_)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when bearer is empty", async () => {
    expect(await verifyBearerToken(null)).toBeNull();
    expect(await verifyBearerToken("")).toBeNull();
  });

  it("returns null when introspection fails", async () => {
    mockIntrospect.mockResolvedValueOnce(null);
    expect(await verifyBearerToken("tfp_pat_deadbeef")).toBeNull();
    expect(mockIntrospect).toHaveBeenCalled();
    expect(mockUserFindFirst).not.toHaveBeenCalled();
  });

  it("returns null when user is missing or inactive", async () => {
    mockIntrospect.mockResolvedValueOnce({ sub: "idp|x", tokenId: "row1" });
    mockUserFindFirst.mockResolvedValueOnce(null);
    expect(await verifyBearerToken("tfp_pat_abc")).toBeNull();

    mockIntrospect.mockResolvedValueOnce({ sub: "idp|x", tokenId: "row1" });
    mockUserFindFirst.mockResolvedValueOnce({
      id: "u1",
      isActive: false,
      deletedAt: null,
    });
    expect(await verifyBearerToken("tfp_pat_abc")).toBeNull();
  });

  it("returns userId and acc-prefixed tokenId on success", async () => {
    mockIntrospect.mockResolvedValueOnce({ sub: "idp|ok", tokenId: "pat-uuid" });
    mockUserFindFirst.mockResolvedValueOnce({
      id: "user-1",
      isActive: true,
      deletedAt: null,
    });
    const out = await verifyBearerToken("tfp_pat_ok");
    expect(out).toEqual({ userId: "user-1", tokenId: "acc:pat-uuid" });
  });

  it("does not call introspect for legacy clara_pat prefix", async () => {
    mockApiFindUnique.mockResolvedValueOnce(null);
    await verifyBearerToken("clara_pat_notintrospect");
    expect(mockIntrospect).not.toHaveBeenCalled();
  });
});
