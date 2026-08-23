import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
const getStats = vi.fn();

vi.mock("@/lib/session", () => ({
  requireAdminUserId: () => requireAdmin(),
}));

vi.mock("@/lib/db/open-banking-admin", () => ({
  getOpenBankingStats: () => getStats(),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/open-banking/stats", () => {
  it("rejects non-admins", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("FORBIDDEN"));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns aggregates for admins", async () => {
    requireAdmin.mockResolvedValueOnce("admin-1");
    getStats.mockResolvedValueOnce({
      connections: { active: 2, needsReauth: 1, error: 0, pending: 0 },
      syncs24h: { success: 3, error: 1 },
      imported7d: 12,
      topAspsps: [{ name: "Nordea", count: 2 }],
      expiringSoon: [],
      recentExpired: [],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { imported7d: number };
    expect(json.imported7d).toBe(12);
  });
});
