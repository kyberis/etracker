import bcrypt from "bcrypt";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { LOCALE_COOKIE } from "@/lib/i18n/locale";
import { log } from "@/lib/log";
import { requireUserId } from "@/lib/session";
import { getStripe, isBillingEnabled } from "@/lib/billing/stripe";

/**
 * GDPR Art. 17 (right to erasure).
 *
 * Behaviour:
 *  1. Re-auth — credentials accounts must supply `currentPassword`; OAuth-
 *     only accounts must type the verification phrase `BORRAR <email>`
 *     (or `DELETE <email>` for English) so the request cannot be triggered
 *     by a stale tab that the user forgot to log out of.
 *  2. Best-effort Stripe cancellation — we cancel the subscription
 *     immediately if billing is enabled and the user has an active row.
 *     Donations remain on the Stripe side per their terms (non-refundable);
 *     we keep the Stripe customer record there so receipts stay valid.
 *  3. `db.user.delete()` — every model with a `userId` FK uses
 *     `onDelete: Cascade` (or `SetNull` for `ContactMessage` so the audit
 *     trail outlives the account). One transactional delete drops every
 *     financial row, chat history, MCP tokens and passkeys.
 *  4. Cookie scrub — the response wipes the NextAuth session token and the
 *     locale cookie so the next page load lands on `/`.
 *
 * Stripe failure does NOT block the delete: we log a warning and proceed.
 * The alternative (refusing to delete because Stripe is unreachable) would
 * be a worse compliance posture.
 */

const deleteSchema = z.object({
  /** Required when the user has a password set. */
  currentPassword: z.string().optional(),
  /**
   * Required when the user signs in only via OAuth or a passkey (no
   * password). Must equal `BORRAR <email>` (case-insensitive) or
   * `DELETE <email>`. Acts as a re-confirmation: prevents one-click delete
   * via a stale browser session.
   */
  confirmPhrase: z.string().optional(),
});

const NEXTAUTH_COOKIE_NAMES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

export async function DELETE(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const body = await request.json().catch(() => ({}));
    const payload = deleteSchema.parse(body);

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        stripeCustomerId: true,
        subscriptionStatus: true,
      },
    });
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    if (user.passwordHash) {
      if (!payload.currentPassword) {
        return jsonError(
          "Tenés que ingresar tu contraseña actual para borrar la cuenta.",
          400,
        );
      }
      const valid = await bcrypt.compare(payload.currentPassword, user.passwordHash);
      if (!valid) {
        return jsonError("La contraseña actual no es correcta.", 401);
      }
    } else {
      if (!isValidConfirmPhrase(payload.confirmPhrase, user.email)) {
        return jsonError(
          `Para confirmar el borrado, tipeá: BORRAR ${user.email}`,
          400,
        );
      }
    }

    await maybeCancelStripeSubscription(user.id, user.stripeCustomerId, user.subscriptionStatus);

    await db.user.delete({ where: { id: userId } });
    log.info("account_deleted", { userId });

    const response = NextResponse.json({ ok: true }, { status: 200 });
    for (const name of NEXTAUTH_COOKIE_NAMES) {
      response.cookies.set(name, "", {
        path: "/",
        expires: new Date(0),
        maxAge: 0,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
    response.cookies.set(LOCALE_COOKIE, "", {
      path: "/",
      expires: new Date(0),
      maxAge: 0,
    });
    return response;
  });
}

function isValidConfirmPhrase(input: string | undefined, email: string): boolean {
  if (!input) return false;
  const normalised = input.trim().replace(/\s+/g, " ").toLowerCase();
  const target = email.toLowerCase();
  return (
    normalised === `borrar ${target}` ||
    normalised === `delete ${target}`
  );
}

async function maybeCancelStripeSubscription(
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
    // Best-effort: don't block the GDPR delete on Stripe API errors.
    log.warn("account_delete_stripe_cancel_failed", {
      userId,
      customerId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
