import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: vi.fn(),
}));

import { isFeatureEnabled } from "@/lib/feature-flags";
import { isBillingEnabled, isUpsellActive } from "./stripe";

const mockedIsFeatureEnabled = vi.mocked(isFeatureEnabled);

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_PRICE_ID_SUPPORTER;
  delete process.env.IDP_BASE_URL;
  delete process.env.IDP_CLIENT_ID;
  delete process.env.IDP_CLIENT_SECRET;
  delete process.env.USE_LEGACY_AUTH;
  vi.clearAllMocks();
  mockedIsFeatureEnabled.mockReset();
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("billing/stripe gates", () => {
  describe("isBillingEnabled", () => {
    it("false when any env is missing", () => {
      expect(isBillingEnabled()).toBe(false);
      process.env.STRIPE_SECRET_KEY = "sk_test_x";
      expect(isBillingEnabled()).toBe(false);
      process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";
      expect(isBillingEnabled()).toBe(false);
    });

    it("true only when all three envs are present", () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_x";
      process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";
      process.env.STRIPE_PRICE_ID_SUPPORTER = "price_x";
      expect(isBillingEnabled()).toBe(true);
    });
  });

  describe("isUpsellActive", () => {
    it("false when billing envs are missing — never asks the flag", async () => {
      const result = await isUpsellActive("user-1");
      expect(result).toBe(false);
      expect(mockedIsFeatureEnabled).not.toHaveBeenCalled();
    });

    it("returns false when unified IdP is configured — Stripe upsell disabled", async () => {
      process.env.IDP_BASE_URL = "https://user.trefolio.com";
      process.env.IDP_CLIENT_ID = "clara";
      process.env.IDP_CLIENT_SECRET = "secret";
      process.env.STRIPE_SECRET_KEY = "sk_test_x";
      process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";
      process.env.STRIPE_PRICE_ID_SUPPORTER = "price_x";
      mockedIsFeatureEnabled.mockResolvedValueOnce(true);

      const result = await isUpsellActive("user-1");
      expect(result).toBe(false);
      expect(mockedIsFeatureEnabled).not.toHaveBeenCalled();
    });

    it("delegates to isFeatureEnabled when billing is enabled", async () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_x";
      process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";
      process.env.STRIPE_PRICE_ID_SUPPORTER = "price_x";
      mockedIsFeatureEnabled.mockResolvedValueOnce(true);

      const result = await isUpsellActive("user-1");

      expect(result).toBe(true);
      expect(mockedIsFeatureEnabled).toHaveBeenCalledWith(
        "quota_upsell",
        "user-1",
      );
    });

    it("returns false when billing is enabled but the flag is off", async () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_x";
      process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";
      process.env.STRIPE_PRICE_ID_SUPPORTER = "price_x";
      mockedIsFeatureEnabled.mockResolvedValueOnce(false);

      const result = await isUpsellActive("user-1");
      expect(result).toBe(false);
    });

    it("can be called without a userId for global checks", async () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_x";
      process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";
      process.env.STRIPE_PRICE_ID_SUPPORTER = "price_x";
      mockedIsFeatureEnabled.mockResolvedValueOnce(true);

      const result = await isUpsellActive();
      expect(result).toBe(true);
      expect(mockedIsFeatureEnabled).toHaveBeenCalledWith(
        "quota_upsell",
        undefined,
      );
    });
  });
});
