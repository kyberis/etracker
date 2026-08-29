import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindFirst = vi.fn();
const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

import { ensureOfficeUser } from "./ensure-office-user";

describe("ensureOfficeUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects missing sub or email", async () => {
    expect(await ensureOfficeUser({ sub: "", email: "a@b.com" })).toEqual({
      ok: false,
      error: "missing_sub",
    });
    expect(await ensureOfficeUser({ sub: "sub-1", email: "nope" })).toEqual({
      ok: false,
      error: "missing_email",
    });
  });

  it("updates an existing user found by idpSub", async () => {
    mockFindFirst.mockResolvedValue({
      id: "u1",
      email: "old@test.com",
      idpSub: "sub-1",
      name: null,
      isActive: true,
      kind: "REGULAR",
    });
    mockUpdate.mockResolvedValue({
      id: "u1",
      email: "new@test.com",
      idpSub: "sub-1",
      name: "Ada",
    });

    const result = await ensureOfficeUser({
      sub: "sub-1",
      email: "new@test.com",
      name: "Ada",
    });

    expect(result).toEqual({
      ok: true,
      created: false,
      user: { id: "u1", email: "new@test.com", idpSub: "sub-1", name: "Ada" },
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("backfills idpSub when a legacy email row exists", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue({
      id: "u2",
      email: "legacy@test.com",
      idpSub: null,
      name: "Legacy",
      isActive: true,
      kind: "REGULAR",
    });
    mockUpdate.mockResolvedValue({
      id: "u2",
      email: "legacy@test.com",
      idpSub: "sub-2",
      name: "Legacy",
    });

    const result = await ensureOfficeUser({
      sub: "sub-2",
      email: "legacy@test.com",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.created).toBe(false);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u2" },
        data: expect.objectContaining({ idpSub: "sub-2" }),
      }),
    );
  });

  it("creates a new REGULAR user when none exists", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      id: "u3",
      email: "fresh@test.com",
      idpSub: "sub-3",
      name: null,
    });

    const result = await ensureOfficeUser({
      sub: "sub-3",
      email: "fresh@test.com",
    });

    expect(result).toEqual({
      ok: true,
      created: true,
      user: { id: "u3", email: "fresh@test.com", idpSub: "sub-3", name: null },
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "fresh@test.com",
          idpSub: "sub-3",
          kind: "REGULAR",
          isActive: true,
          dailyAgentMessageLimit: 30,
        }),
      }),
    );
  });

  it("rejects inactive or conflicting email rows", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue({
      id: "u4",
      email: "x@test.com",
      idpSub: "other-sub",
      name: null,
      isActive: true,
      kind: "REGULAR",
    });
    expect(await ensureOfficeUser({ sub: "sub-4", email: "x@test.com" })).toEqual({
      ok: false,
      error: "email_conflict",
    });
  });
});
