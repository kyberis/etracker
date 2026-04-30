import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import {
  getStripe,
  isBillingEnabled,
} from "@/lib/billing/stripe";
import { jsonError, withApi } from "@/lib/http";
import { getPublicAppBaseUrl } from "@/lib/public-app-url";
import { requireUserId } from "@/lib/session";

/**
 * Creates a Stripe Billing Portal session so the user can manage / cancel
 * the Supporter subscription, update payment method, view invoices, etc.
 * Anyone with a stripeCustomerId can open it (so a former subscriber can
 * still see receipts). Returns `{ url }`.
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
    const stripe = getStripe();
    if (!stripe) {
      return jsonError(
        "El sistema de pagos no está configurado en este servidor.",
        503,
      );
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });
    if (!user?.stripeCustomerId) {
      return jsonError(
        "Todavía no tenés un perfil de pago en Stripe.",
        404,
      );
    }

    const baseUrl =
      getPublicAppBaseUrl() ?? new URL(request.url).origin;

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${baseUrl}/settings`,
    });
    return NextResponse.json({ url: session.url });
  });
}
