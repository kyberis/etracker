import { beforeEach, describe, expect, it, vi } from "vitest";

const createSession = vi.fn();
const createActive = vi.fn();
const linkAccounts = vi.fn();
const sync = vi.fn();
const verifyState = vi.fn();
const enabled = vi.fn();
const available = vi.fn();

vi.mock("@/lib/enable-banking/config", () => ({
  isEnableBankingEnabled: () => enabled(),
}));

vi.mock("@/lib/enable-banking/access", () => ({
  isOpenBankingAvailable: (...args: unknown[]) => available(...args),
}));

vi.mock("@/lib/enable-banking/oauth-state", () => ({
  verifyOAuthState: (...args: unknown[]) => verifyState(...args),
}));

vi.mock("@/lib/enable-banking/client", () => ({
  createSession: (...args: unknown[]) => createSession(...args),
}));

vi.mock("@/lib/crypto", () => ({
  encryptSecret: (value: string) => `enc:${value}`,
}));

vi.mock("@/lib/db/bank-connections", () => ({
  createActiveConnection: (...args: unknown[]) => createActive(...args),
}));

vi.mock("@/lib/bank-sync/sync-connection", () => ({
  linkSessionAccounts: (...args: unknown[]) => linkAccounts(...args),
  syncConnection: (...args: unknown[]) => sync(...args),
}));

vi.mock("@/lib/log", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  enabled.mockReturnValue(true);
  available.mockResolvedValue(true);
  verifyState.mockReturnValue({
    userId: "u1",
    institutionName: "Nordea",
    institutionCountry: "FI",
  });
});

describe("open-banking callback", () => {
  it("creates a connection and syncs on success", async () => {
    createSession.mockResolvedValue({
      session_id: "sess",
      accounts: [{ uid: "acc_1", currency: "EUR" }],
      access: { valid_until: "2026-09-01T00:00:00.000Z" },
    });
    createActive.mockResolvedValue({ id: "c1" });
    linkAccounts.mockResolvedValue(1);
    sync.mockResolvedValue({ status: "success" });

    const res = await GET(
      new Request("http://localhost/api/open-banking/callback?code=abc&state=signed"),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("openBanking=connected");
    expect(createActive).toHaveBeenCalled();
    expect(sync).toHaveBeenCalledWith({ connectionId: "c1", trigger: "callback" });
  });

  it("redirects empty when the session has no accounts", async () => {
    createSession.mockResolvedValue({
      session_id: "sess",
      accounts: [],
    });
    const res = await GET(
      new Request("http://localhost/api/open-banking/callback?code=abc&state=signed"),
    );
    expect(res.headers.get("location")).toContain("openBanking=empty");
    expect(createActive).not.toHaveBeenCalled();
  });

  it("redirects unavailable when the user is not allowed", async () => {
    available.mockResolvedValue(false);
    const res = await GET(
      new Request("http://localhost/api/open-banking/callback?code=abc&state=signed"),
    );
    expect(res.headers.get("location")).toContain("openBanking=unavailable");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("redirects invalid when state is missing", async () => {
    const res = await GET(
      new Request("http://localhost/api/open-banking/callback?code=abc"),
    );
    expect(res.headers.get("location")).toContain("openBanking=invalid");
  });
});
