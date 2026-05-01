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
import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { isLocale } from "@/lib/i18n/locale";
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
        "The payment system is not configured on this server.",
        503,
      );
    }
    const upsellOn = await isUpsellActive(userId);
    if (!upsellOn) {
      return jsonError("This feature is not enabled for your account.", 403);
    }

    const stripe = getStripe();
    if (!stripe) {
      return jsonError(
        "The payment system is not configured on this server.",
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
            product_data:
              donationCopy(await readUserLocale(userId)),
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
 * Read the caller's persisted locale (defaults to `es`). Used for Stripe
 * checkout product metadata so the donation page reads in the user's language.
 */
async function readUserLocale(userId: string) {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { locale: true },
  });
  return isLocale(u?.locale) ? (u!.locale as "es" | "en") : "es";
}

function donationCopy(locale: "es" | "en") {
  if (locale === "en") {
    return {
      name: "Donation to Clara",
      description:
        "One-off contribution to keep Clara's infrastructure running.",
    };
  }
  return {
    name: "Donación a Clara",
    description: "Aporte único para mantener la infraestructura de Clara.",
  };
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
