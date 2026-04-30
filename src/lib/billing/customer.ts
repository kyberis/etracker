import type Stripe from "stripe";

import { db } from "@/lib/db";
import { getStripe } from "@/lib/billing/stripe";

/**
 * Returns the user's Stripe customer id, creating it lazily on first use.
 * Idempotent: a concurrent request that wins the race re-uses the same
 * customer because we re-read the User row inside the `update`.
 *
 * Throws if Stripe isn't configured — callers must check `isBillingEnabled`
 * first.
 */
export async function getOrCreateStripeCustomerId(
  userId: string,
): Promise<string> {
  const stripe = getStripe();
  if (!stripe) throw new Error("STRIPE_NOT_CONFIGURED");

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, stripeCustomerId: true, name: true },
  });
  if (!user) throw new Error("USER_NOT_FOUND");
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name ?? undefined,
    metadata: { etrackerUserId: user.id },
  });

  await db.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

/**
 * Resolves an `etracker` user id from a Stripe customer. Tries metadata
 * first, then falls back to the column we keep in sync.
 */
export async function resolveUserIdFromCustomer(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): Promise<string | null> {
  if (!customer) return null;
  const customerId =
    typeof customer === "string" ? customer : customer.id;
  if (!customerId) return null;
  const row = await db.user.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return row?.id ?? null;
}
