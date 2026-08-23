import { BankConnectionStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const isEnabled = vi.fn();
const isFlagOn = vi.fn();
const listConnections = vi.fn();

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, cache: (fn: unknown) => fn };
});

vi.mock("@/lib/enable-banking/config", () => ({
  isEnableBankingEnabled: () => isEnabled(),
}));

vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: (...args: unknown[]) => isFlagOn(...args),
}));

vi.mock("@/lib/db/bank-connections", () => ({
  listUserConnections: (...args: unknown[]) => listConnections(...args),
}));

import { getOpenBankingCtaKind } from "./access";

beforeEach(() => {
  vi.clearAllMocks();
  isEnabled.mockReturnValue(true);
  isFlagOn.mockResolvedValue(true);
  listConnections.mockResolvedValue([]);
});

describe("getOpenBankingCtaKind", () => {
  it("returns null when the integration is off", async () => {
    isEnabled.mockReturnValue(false);
    await expect(getOpenBankingCtaKind("u1")).resolves.toBeNull();
    expect(listConnections).not.toHaveBeenCalled();
  });

  it("returns connect when there is no active bank link", async () => {
    await expect(getOpenBankingCtaKind("u1")).resolves.toBe("connect");
  });

  it("returns reauth when a consent needs renewing", async () => {
    listConnections.mockResolvedValue([
      { status: BankConnectionStatus.NEEDS_REAUTH },
    ]);
    await expect(getOpenBankingCtaKind("u1")).resolves.toBe("reauth");
  });

  it("hides the CTA when a connection is already active", async () => {
    listConnections.mockResolvedValue([{ status: BankConnectionStatus.ACTIVE }]);
    await expect(getOpenBankingCtaKind("u1")).resolves.toBeNull();
  });
});
