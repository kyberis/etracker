import type Stripe from "stripe";
import { NextResponse } from "next/server";

import { resolveUserIdFromCustomer } from "@/lib/billing/customer";
import { getStripe } from "@/lib/billing/stripe";
import {
  applySubscriptionState,
  clearSubscriptionState,
  recordDonation,
} from "@/lib/billing/subscription";
import { db } from "@/lib/db";
import { log } from "@/lib/log";

/**
 * Stripe webhook receiver. Single endpoint for every event we care about
 * because the URL has to be registered once in the Stripe Dashboard.
 *
 * Idempotency:
 *  - Insert the event id into `StripeWebhookEvent` BEFORE applying side
 *    effects. A duplicate insert (P2002) means we already processed this
 *    event; we return 200 immediately.
 *
 * Behaviour summary:
 *  - `checkout.session.completed` (mode=subscription): set `subscriptionStatus`,
 *    bump `dailyAgentMessageLimit` to SUPPORTER_DAILY_LIMIT.
 *  - `checkout.session.completed` (mode=payment, kind=donation): persist a
 *    `Donation` row. No subscription side-effect.
 *  - `customer.subscription.created` / `.updated`: mirror status + period
 *    end; if active|trialing → 200 cap, else free cap.
 *  - `customer.subscription.deleted`: drop the cap back to free.
 *  - `invoice.paid` (with `subscription`): refresh status from the source.
 *
 * Never throws to Stripe — logs and returns 200 on internal errors so
 * Stripe doesn't retry forever; we surface failures via logs.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Reads the period end from a subscription. The 2025-10-29 Stripe API
 * moved `current_period_end` off the subscription and onto each item,
 * because subscriptions can have items with different cycles. For our
 * single-item Supporter plan, the first item's value is the right one.
 */
function readPeriodEnd(subscription: Stripe.Subscription): number | null {
  const item = subscription.items.data[0];
  if (item && typeof item.current_period_end === "number") {
    return item.current_period_end;
  }
  return null;
}

/** Pulls the subscription id off the new `parent.subscription_details`. */
function readInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const details = invoice.parent?.subscription_details;
  if (!details) return null;
  const sub = details.subscription;
  if (typeof sub === "string") return sub;
  return sub?.id ?? null;
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return new NextResponse("Stripe webhook not configured.", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new NextResponse("Missing signature.", { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    log.error("stripe.webhook.invalid_signature", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new NextResponse("Invalid signature.", { status: 400 });
  }

  // Idempotency log: insert first; if it fails P2002 we're a replay.
  try {
    await db.stripeWebhookEvent.create({
      data: { id: event.id, type: event.type },
    });
  } catch {
    log.info("stripe.webhook.replay_skipped", {
      eventId: event.id,
      type: event.type,
    });
    return NextResponse.json({ received: true, replay: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(stripe, event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpsert(event.data.object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;
      case "invoice.paid":
      case "invoice.payment_failed":
        await handleInvoiceEvent(stripe, event.data.object);
        break;
      default:
        log.info("stripe.webhook.ignored", {
          eventId: event.id,
          type: event.type,
        });
    }
  } catch (error) {
    log.error("stripe.webhook.handler_failed", {
      eventId: event.id,
      type: event.type,
      error: error instanceof Error ? error.message : String(error),
    });
    // Still return 200 so Stripe doesn't retry indefinitely. Failures
    // surface via the log; manual replay is possible by deleting the
    // StripeWebhookEvent row and triggering "Resend" in the dashboard.
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const userId =
    session.client_reference_id ??
    (typeof session.metadata?.etrackerUserId === "string"
      ? session.metadata.etrackerUserId
      : null);

  if (session.mode === "subscription") {
    const targetUserId =
      userId ?? (await resolveUserIdFromCustomer(session.customer));
    if (!targetUserId) {
      log.error("stripe.webhook.checkout_subscription_no_user", {
        sessionId: session.id,
      });
      return;
    }
    // Pull the live subscription so we capture status + period end.
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;
    if (!subscriptionId) {
      log.error("stripe.webhook.checkout_subscription_missing_id", {
        sessionId: session.id,
      });
      return;
    }
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await applySubscriptionState(
      targetUserId,
      subscription.status,
      readPeriodEnd(subscription),
    );
    return;
  }

  if (session.mode === "payment") {
    const targetUserId =
      userId ?? (await resolveUserIdFromCustomer(session.customer));
    if (!targetUserId) {
      log.error("stripe.webhook.checkout_payment_no_user", {
        sessionId: session.id,
      });
      return;
    }
    if (session.metadata?.kind !== "donation") {
      log.info("stripe.webhook.checkout_payment_ignored", {
        sessionId: session.id,
        kind: session.metadata?.kind ?? null,
      });
      return;
    }
    const amountCents =
      typeof session.amount_total === "number" ? session.amount_total : 0;
    const currency = (session.currency ?? "eur").toUpperCase();
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    await recordDonation({
      userId: targetUserId,
      stripeSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
      amountCents,
      currency,
    }).catch((error) => {
      // Unique on stripeSessionId — another retry already inserted.
      log.info("stripe.webhook.donation_duplicate", {
        sessionId: session.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}

async function handleSubscriptionUpsert(
  subscription: Stripe.Subscription,
): Promise<void> {
  const userId = await resolveUserIdFromCustomer(subscription.customer);
  if (!userId) {
    log.error("stripe.webhook.subscription_no_user", {
      subscriptionId: subscription.id,
      customer:
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id,
    });
    return;
  }
  await applySubscriptionState(
    userId,
    subscription.status,
    readPeriodEnd(subscription),
  );
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
): Promise<void> {
  const userId = await resolveUserIdFromCustomer(subscription.customer);
  if (!userId) return;
  await clearSubscriptionState(userId);
  log.info("stripe.webhook.subscription_canceled", { userId });
}

async function handleInvoiceEvent(
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<void> {
  const subscriptionId = readInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = await resolveUserIdFromCustomer(subscription.customer);
  if (!userId) return;
  await applySubscriptionState(
    userId,
    subscription.status,
    readPeriodEnd(subscription),
  );
  log.info("stripe.webhook.subscription_synced", {
    userId,
    status: subscription.status,
  });
}
