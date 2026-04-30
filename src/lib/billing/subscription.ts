import type Stripe from "stripe";

import {
  FREE_DAILY_LIMIT,
  SUPPORTER_DAILY_LIMIT,
} from "@/lib/billing/pricing";
import { db } from "@/lib/db";

/**
 * Mirror Stripe subscription state into the User row. Active/trialing
 * statuses bump the daily cap to SUPPORTER_DAILY_LIMIT; anything else
 * (past_due, canceled, unpaid, incomplete, …) drops it back to the free
 * tier so users don't keep premium access on a failed renewal.
 *
 * Pure data layer — pulled out of the webhook so it's testable without
 * mocking Stripe's full event shape.
 */
export async function applySubscriptionState(
  userId: string,
  status: Stripe.Subscription.Status,
  currentPeriodEnd: number | null,
): Promise<void> {
  const isActive = status === "active" || status === "trialing";
  const periodEnd =
    typeof currentPeriodEnd === "number"
      ? new Date(currentPeriodEnd * 1000)
      : null;

  await db.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus: status,
      subscriptionCurrentPeriodEnd: periodEnd,
      dailyAgentMessageLimit: isActive
        ? SUPPORTER_DAILY_LIMIT
        : FREE_DAILY_LIMIT,
    },
  });
}

/**
 * Drop the user back to the free tier. Used by `customer.subscription.deleted`.
 */
export async function clearSubscriptionState(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus: "canceled",
      subscriptionCurrentPeriodEnd: null,
      dailyAgentMessageLimit: FREE_DAILY_LIMIT,
    },
  });
}

/**
 * Persist a one-off donation row from a `checkout.session.completed`
 * payment event. Idempotent: re-inserts on the same `stripeSessionId`
 * fail with P2002 and are swallowed by the caller.
 */
export async function recordDonation(input: {
  userId: string;
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
  amountCents: number;
  currency: string;
}): Promise<void> {
  await db.donation.create({
    data: {
      userId: input.userId,
      stripeSessionId: input.stripeSessionId,
      stripePaymentIntentId: input.stripePaymentIntentId,
      amountCents: input.amountCents,
      currency: input.currency.toUpperCase(),
    },
  });
}
