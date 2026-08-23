import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockOverrideFindUnique = vi.fn();
const mockOverrideUpsert = vi.fn();
const mockOverrideDelete = vi.fn();
const mockFlagFindUnique = vi.fn();
const mockFlagFindMany = vi.fn();
const mockFlagUpsert = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    featureFlagOverride: {
      findUnique: (...args: unknown[]) => mockOverrideFindUnique(...args),
      upsert: (...args: unknown[]) => mockOverrideUpsert(...args),
      delete: (...args: unknown[]) => mockOverrideDelete(...args),
    },
    featureFlag: {
      findUnique: (...args: unknown[]) => mockFlagFindUnique(...args),
      findMany: (...args: unknown[]) => mockFlagFindMany(...args),
      upsert: (...args: unknown[]) => mockFlagUpsert(...args),
    },
  },
}));

vi.mock("@/lib/log", () => ({
  log: { error: vi.fn(), info: vi.fn() },
}));

vi.mock("@vercel/functions", () => ({
  // Force the cache wrapper to fall through to the DB on every call so
  // assertions about the DB layer are deterministic.
  getCache: () => {
    throw new Error("no cache in tests");
  },
}));

import {
  FEATURE_FLAGS,
  isFeatureEnabled,
  isFeatureFlagKey,
  listFeatureFlags,
  setFeatureEnabled,
  setUserFeatureOverride,
} from "./feature-flags";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("feature-flags", () => {
  describe("registry", () => {
    it("isFeatureFlagKey accepts known keys", () => {
      expect(isFeatureFlagKey("quota_upsell")).toBe(true);
      expect(isFeatureFlagKey("open_banking")).toBe(true);
      expect(isFeatureFlagKey("nope")).toBe(false);
    });

    it("default for quota_upsell is OFF", () => {
      expect(FEATURE_FLAGS.quota_upsell.defaultEnabled).toBe(false);
    });
  });

  describe("isFeatureEnabled", () => {
    it("returns the registry default when no global row exists", async () => {
      mockFlagFindUnique.mockResolvedValueOnce(null);
      const value = await isFeatureEnabled("quota_upsell");
      expect(value).toBe(false);
    });

    it("returns the global value when a row exists", async () => {
      mockFlagFindUnique.mockResolvedValueOnce({ enabled: true });
      const value = await isFeatureEnabled("quota_upsell");
      expect(value).toBe(true);
    });

    it("per-user override beats the global value (override on)", async () => {
      mockOverrideFindUnique.mockResolvedValueOnce({ enabled: true });
      mockFlagFindUnique.mockResolvedValueOnce({ enabled: false });
      const value = await isFeatureEnabled("quota_upsell", "user-1");
      expect(value).toBe(true);
      // Global lookup should not have happened when the override is present.
      expect(mockFlagFindUnique).not.toHaveBeenCalled();
    });

    it("per-user override beats the global value (override off)", async () => {
      mockOverrideFindUnique.mockResolvedValueOnce({ enabled: false });
      const value = await isFeatureEnabled("quota_upsell", "user-1");
      expect(value).toBe(false);
    });

    it("falls back to the global lookup when no override exists", async () => {
      mockOverrideFindUnique.mockResolvedValueOnce(null);
      mockFlagFindUnique.mockResolvedValueOnce({ enabled: true });
      const value = await isFeatureEnabled("quota_upsell", "user-1");
      expect(value).toBe(true);
    });

    it("returns the registry default if the DB throws", async () => {
      mockFlagFindUnique.mockRejectedValueOnce(new Error("boom"));
      const value = await isFeatureEnabled("quota_upsell");
      expect(value).toBe(false);
    });
  });

  describe("setFeatureEnabled", () => {
    it("upserts the row and records updatedBy", async () => {
      mockFlagUpsert.mockResolvedValueOnce({});
      await setFeatureEnabled("quota_upsell", true, "admin-1");
      expect(mockFlagUpsert).toHaveBeenCalledWith({
        where: { key: "quota_upsell" },
        create: { key: "quota_upsell", enabled: true, updatedBy: "admin-1" },
        update: { enabled: true, updatedBy: "admin-1" },
      });
    });
  });

  describe("setUserFeatureOverride", () => {
    it("upserts the override row for non-null values", async () => {
      mockOverrideUpsert.mockResolvedValueOnce({});
      await setUserFeatureOverride("quota_upsell", "user-1", true);
      expect(mockOverrideUpsert).toHaveBeenCalledWith({
        where: { userId_key: { userId: "user-1", key: "quota_upsell" } },
        create: { userId: "user-1", key: "quota_upsell", enabled: true },
        update: { enabled: true },
      });
    });

    it("deletes the override when passed null", async () => {
      mockOverrideDelete.mockResolvedValueOnce({});
      await setUserFeatureOverride("quota_upsell", "user-1", null);
      expect(mockOverrideDelete).toHaveBeenCalledWith({
        where: { userId_key: { userId: "user-1", key: "quota_upsell" } },
      });
    });

    it("swallows missing-row errors when deleting", async () => {
      mockOverrideDelete.mockRejectedValueOnce(new Error("P2025"));
      await expect(
        setUserFeatureOverride("quota_upsell", "user-1", null),
      ).resolves.toBeUndefined();
    });
  });

  describe("listFeatureFlags", () => {
    it("returns one snapshot per registry key, defaulting unknown rows", async () => {
      mockFlagFindMany.mockResolvedValueOnce([]);
      const flags = await listFeatureFlags();
      expect(flags).toHaveLength(Object.keys(FEATURE_FLAGS).length);
      const upsell = flags.find((f) => f.key === "quota_upsell")!;
      expect(upsell.enabled).toBe(false);
      expect(upsell.defaultEnabled).toBe(false);
    });

    it("merges live DB state when present", async () => {
      mockFlagFindMany.mockResolvedValueOnce([
        {
          key: "quota_upsell",
          enabled: true,
          updatedBy: "admin-1",
          updatedAt: new Date("2026-04-30T00:00:00Z"),
        },
      ]);
      const flags = await listFeatureFlags();
      const upsell = flags.find((f) => f.key === "quota_upsell")!;
      expect(upsell.enabled).toBe(true);
      expect(upsell.updatedBy).toBe("admin-1");
      expect(upsell.updatedAt).toBe("2026-04-30T00:00:00.000Z");
    });
  });
});
