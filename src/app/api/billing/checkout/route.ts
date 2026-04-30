import { NextResponse } from "next/server";

import {
  getOrCreateStripeCustomerId,
} from "@/lib/billing/customer";
import {
  BILLING_CURRENCY,
  SUPPORTER_PRICE_EUR_CENTS,
} from "@/lib/billing/pricing";
import {
  getStripe,
  isBillingEnabled,
  isUpsellActive,
} from "@/lib/billing/stripe";
import { jsonError, withApi } from "@/lib/http";
import { getPublicAppBaseUrl } from "@/lib/public-app-url";
import { requireUserId } from "@/lib/session";
import { billingCheckoutSchema } from "@/lib/validators";

/**
 * Creates a Stripe Checkout session for either the Supporter subscription
 * or a one-time donation. Returns `{ url }`; the client redirects via
 * `window.location.href`. Authenticated users only.
 *
 * Gate: requires both billing envs (`isBillingEnabled`) and the
 * `quota_upsell` flag for the calling user (`isUpsellActive`). Self-host
 * → 503 with a friendly message. Flag off → 403.
 */
export async function POST(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();

    if (!isBillingEnabled()) {
      return jsonError(
        "El sistema de pagos no está configurado en este servidor.",
        503,
      );
    }
    const upsellOn = await isUpsellActive(userId);
    if (!upsellOn) {
      return jsonError("Esta función no está habilitada para tu cuenta.", 403);
    }

    const stripe = getStripe();
    if (!stripe) {
      return jsonError(
        "El sistema de pagos no está configurado en este servidor.",
        503,
      );
    }

    const body = billingCheckoutSchema.parse(await request.json());
    const customerId = await getOrCreateStripeCustomerId(userId);

    const baseUrl =
      getPublicAppBaseUrl() ??
      new URL(request.url).origin;
    const successUrl = `${baseUrl}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/app?checkout=cancel`;

    if (body.mode === "subscription") {
      const priceId = process.env.STRIPE_PRICE_ID_SUPPORTER!;
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
        client_reference_id: userId,
        metadata: { etrackerUserId: userId, kind: "supporter_subscription" },
        subscription_data: {
          metadata: { etrackerUserId: userId, tier: "supporter" },
        },
      });
      return NextResponse.json({ url: session.url });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      submit_type: "donate",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: BILLING_CURRENCY,
            unit_amount: body.amountCents,
            product_data: {
              name: "Donación a Clara",
              description:
                "Aporte único para mantener la infraestructura de Clara.",
            },
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      metadata: {
        etrackerUserId: userId,
        kind: "donation",
        amountCents: String(body.amountCents),
      },
    });
    return NextResponse.json({ url: session.url });
  });
}

/**
 * Documents the supported subscription price for the client (used by the
 * modal so it stays in sync with `SUPPORTER_PRICE_EUR_CENTS`). Hides
 * everything when the upsell isn't active for the caller.
 */
export async function GET() {
  return withApi(async () => {
    const userId = await requireUserId();
    const active = await isUpsellActive(userId);
    return {
      active,
      currency: BILLING_CURRENCY.toUpperCase(),
      supporterPriceCents: active ? SUPPORTER_PRICE_EUR_CENTS : null,
    };
  });
}
