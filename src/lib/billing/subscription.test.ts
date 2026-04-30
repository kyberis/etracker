import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUserUpdate = vi.fn();
const mockDonationCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    user: { update: (...args: unknown[]) => mockUserUpdate(...args) },
    donation: { create: (...args: unknown[]) => mockDonationCreate(...args) },
  },
}));

import {
  applySubscriptionState,
  clearSubscriptionState,
  recordDonation,
} from "./subscription";

const FREE = 30;
const SUPPORTER = 200;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("billing/subscription", () => {
  describe("applySubscriptionState", () => {
    it("active subscription bumps the daily cap to 200", async () => {
      mockUserUpdate.mockResolvedValueOnce({});
      const ts = Math.floor(Date.UTC(2026, 4, 30) / 1000);
      await applySubscriptionState("user-1", "active", ts);
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: {
          subscriptionStatus: "active",
          subscriptionCurrentPeriodEnd: new Date(ts * 1000),
          dailyAgentMessageLimit: SUPPORTER,
        },
      });
    });

    it("trialing also bumps the cap to 200", async () => {
      mockUserUpdate.mockResolvedValueOnce({});
      await applySubscriptionState("user-1", "trialing", null);
      const args = mockUserUpdate.mock.calls[0]?.[0];
      expect(args.data.dailyAgentMessageLimit).toBe(SUPPORTER);
      expect(args.data.subscriptionCurrentPeriodEnd).toBeNull();
    });

    it("past_due drops back to the free cap", async () => {
      mockUserUpdate.mockResolvedValueOnce({});
      await applySubscriptionState("user-1", "past_due", null);
      const args = mockUserUpdate.mock.calls[0]?.[0];
      expect(args.data.dailyAgentMessageLimit).toBe(FREE);
      expect(args.data.subscriptionStatus).toBe("past_due");
    });

    it("incomplete / unpaid stay on the free cap", async () => {
      for (const status of ["incomplete", "unpaid", "canceled"] as const) {
        mockUserUpdate.mockResolvedValueOnce({});
        await applySubscriptionState("user-1", status, null);
        const args =
          mockUserUpdate.mock.calls[mockUserUpdate.mock.calls.length - 1]?.[0];
        expect(args.data.dailyAgentMessageLimit).toBe(FREE);
      }
    });
  });

  describe("clearSubscriptionState", () => {
    it("marks canceled and resets the cap", async () => {
      mockUserUpdate.mockResolvedValueOnce({});
      await clearSubscriptionState("user-1");
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: {
          subscriptionStatus: "canceled",
          subscriptionCurrentPeriodEnd: null,
          dailyAgentMessageLimit: FREE,
        },
      });
    });
  });

  describe("recordDonation", () => {
    it("normalises currency to upper-case", async () => {
      mockDonationCreate.mockResolvedValueOnce({});
      await recordDonation({
        userId: "user-1",
        stripeSessionId: "cs_test_1",
        stripePaymentIntentId: "pi_1",
        amountCents: 500,
        currency: "eur",
      });
      expect(mockDonationCreate).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          stripeSessionId: "cs_test_1",
          stripePaymentIntentId: "pi_1",
          amountCents: 500,
          currency: "EUR",
        },
      });
    });
  });
});
