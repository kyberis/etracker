import { NextResponse } from "next/server";

import { getOrCreateStripeCustomerId } from "@/lib/billing/customer";
import { BILLING_CURRENCY } from "@/lib/billing/pricing";
import { getStripe, isDonationBillingEnabled, isUpsellActive } from "@/lib/billing/stripe";
import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { isLocale } from "@/lib/i18n/locale";
import { getPublicAppBaseUrl } from "@/lib/public-app-url";
import { requireUserId } from "@/lib/session";
import { billingCheckoutSchema } from "@/lib/validators";

/**
 * POST /api/billing/checkout — **donations only**. Pro/Trefolio subscriptions are
 * purchased on user.trefolio.com (unified IdP).
 */
export async function POST(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();

    if (!isDonationBillingEnabled()) {
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

    const parsed = billingCheckoutSchema.parse(await request.json());
    if (parsed.mode !== "donation") {
      return jsonError(
        "Subscription checkout is on user.trefolio.com (unified account).",
        410,
      );
    }

    const customerId = await getOrCreateStripeCustomerId(userId);

    const baseUrl =
      getPublicAppBaseUrl() ??
      new URL(request.url).origin;
    const successUrl = `${baseUrl}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/app?checkout=cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      submit_type: "donate",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: BILLING_CURRENCY,
            unit_amount: parsed.amountCents,
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
        amountCents: String(parsed.amountCents),
      },
    });
    return NextResponse.json({ url: session.url });
  });
}

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
