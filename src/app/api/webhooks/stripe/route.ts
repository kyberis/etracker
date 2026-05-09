import type Stripe from "stripe";
import { NextResponse } from "next/server";

import { resolveUserIdFromCustomer } from "@/lib/billing/customer";
import { getStripe } from "@/lib/billing/stripe";
import { recordDonation } from "@/lib/billing/subscription";
import { db } from "@/lib/db";
import { log } from "@/lib/log";

/**
 * Stripe webhook — **donations only**. Pro subscriptions are processed by
 * user.trefolio.com (`external/accounts`).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
    } else {
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
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  if (session.mode !== "payment") {
    log.info("stripe.webhook.checkout_ignored_non_payment", {
      sessionId: session.id,
      mode: session.mode,
    });
    return;
  }

  const userId =
    session.client_reference_id ??
    (typeof session.metadata?.etrackerUserId === "string"
      ? session.metadata.etrackerUserId
      : null);

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
    log.info("stripe.webhook.donation_duplicate", {
      sessionId: session.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
