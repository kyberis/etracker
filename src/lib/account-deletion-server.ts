/**
 * Server-only helpers for account deletion: Stripe cancellation and the
 * shared "purge now" primitive used by every code path that destroys a
 * user row (the daily cron after the grace window, the user-initiated
 * force delete that waives grace, and the admin panel's "Purge now"
 * action).
 *
 * Kept in a separate file from `@/lib/account-deletion` because that
 * module is imported by client components (settings page) for the
 * `ACCOUNT_DELETION_GRACE_DAYS` constant — bundling Stripe + Prisma into
 * the client would bloat the JS payload and risk leaking secrets via
 * misconfigured tree-shaking.
 */

import "server-only";

import { db } from "@/lib/db";
import { getStripe, isBillingEnabled } from "@/lib/billing/stripe";
import { log } from "@/lib/log";

/**
 * Best-effort Stripe subscription cancellation. A Stripe outage MUST NOT
 * block a GDPR erasure request: we catch every error, log it, and
 * proceed. Operators see the warning and can clean up manually on the
 * Stripe side.
 */
export async function cancelStripeSubscriptionForUser(
  userId: string,
  customerId: string | null,
  subscriptionStatus: string | null,
): Promise<void> {
  if (!customerId) return;
  if (!isBillingEnabled()) return;
  if (
    subscriptionStatus !== "active" &&
    subscriptionStatus !== "trialing" &&
    subscriptionStatus !== "past_due"
  ) {
    return;
  }
  const stripe = getStripe();
  if (!stripe) return;
  try {
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 5,
    });
    for (const sub of subs.data) {
      if (sub.status === "canceled") continue;
      await stripe.subscriptions.cancel(sub.id, {
        invoice_now: false,
        prorate: false,
      });
    }
    log.info("account_delete_stripe_cancelled", { userId, customerId });
  } catch (err) {
    log.warn("account_delete_stripe_cancel_failed", {
      userId,
      customerId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export type PurgeReason = "force_user" | "force_admin" | "cron";

/**
 * Hard-delete a user row immediately, cancelling any active Stripe
 * subscription on the way out. The schema's `onDelete: Cascade` chain
 * removes every owned row (banks, expenses, savings, chat, MCP tokens,
 * passkeys, …); rows declared `onDelete: SetNull` (e.g.
 * `ContactMessage.userId`) survive on purpose so abuse / audit trails
 * outlive the account.
 *
 * Idempotent: a row already gone returns `{ purged: false }` rather than
 * throwing, so callers can retry without bespoke error handling.
 */
export async function purgeUserNow(
  userId: string,
  reason: PurgeReason,
): Promise<{ purged: boolean }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      stripeCustomerId: true,
      subscriptionStatus: true,
    },
  });
  if (!user) {
    log.info("account_purge_now.not_found", { userId, reason });
    return { purged: false };
  }
  await cancelStripeSubscriptionForUser(
    user.id,
    user.stripeCustomerId,
    user.subscriptionStatus,
  );
  try {
    await db.user.delete({ where: { id: userId } });
    log.info("account_purge_now.success", { userId, reason });
    return { purged: true };
  } catch (err) {
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: unknown }).code)
        : null;
    // P2025: record not found — treat as already purged.
    if (code === "P2025") {
      log.info("account_purge_now.already_gone", { userId, reason });
      return { purged: false };
    }
    throw err;
  }
}
