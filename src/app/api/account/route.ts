import bcrypt from "bcrypt";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ACCOUNT_DELETION_GRACE_DAYS,
  getDeletionScheduledFor,
} from "@/lib/account-deletion";
import {
  cancelStripeSubscriptionForUser,
  purgeUserNow,
} from "@/lib/account-deletion-server";
import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { LOCALE_COOKIE } from "@/lib/i18n/locale";
import { log } from "@/lib/log";
import { requireUserId } from "@/lib/session";

/**
 * GDPR Art. 17 (right to erasure) — soft-delete with a 30-day grace window.
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
 *     Cancelling now (rather than at purge time) means the user is not
 *     charged for a 30-day grace window they cannot use.
 *  3. `User.deletedAt = now()` — the row stays in place. The (app) layout
 *     redirects users with `deletedAt` set to `/account/restore`, the
 *     per-user MCP refuses their PATs, the agent quota refuses chat, and
 *     the daily nudge cron skips them. The `/api/cron/account-purge` cron
 *     hard-deletes anything past `ACCOUNT_DELETION_GRACE_DAYS`.
 *  4. Cookie scrub — the response wipes the NextAuth session token and the
 *     locale cookie so the next page load lands on `/`.
 *
 * Stripe failure does NOT block the soft-delete: we log a warning and
 * proceed. The alternative (refusing to delete because Stripe is
 * unreachable) would be a worse compliance posture.
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
  /**
   * If `true`, the user is explicitly waiving the 30-day grace window:
   * the row is hard-deleted on the spot (and Stripe subscriptions
   * cancelled). We still require the same re-auth (password or
   * confirmation phrase) — `force` only changes what we do AFTER the
   * re-auth succeeds, not whether it's required.
   *
   * Surfaced from a separate "Borrar definitivamente y ya" button in
   * settings; not the default path because the soft-delete + grace UX
   * has a much better recovery story for the typical "I clicked the
   * wrong button" case.
   */
  force: z.boolean().optional(),
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
        deletedAt: true,
      },
    });
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }
    // ── Re-auth (always required, even on `force`) ────────────────────
    // We deliberately validate credentials *before* checking the
    // pending-deletion state so an attacker with a stale cookie cannot
    // confirm whether a soft-deleted row still exists by polling DELETE.
    if (user.passwordHash) {
      if (!payload.currentPassword) {
        return jsonError(
          "You must enter your current password to delete the account.",
          400,
        );
      }
      const valid = await bcrypt.compare(payload.currentPassword, user.passwordHash);
      if (!valid) {
        return jsonError("The current password is incorrect.", 401);
      }
    } else {
      if (!isValidConfirmPhrase(payload.confirmPhrase, user.email)) {
        return jsonError(
          `To confirm deletion, type: BORRAR ${user.email} or DELETE ${user.email}`,
          400,
        );
      }
    }

    // ── Force path: hard-delete on the spot (no grace) ────────────────
    if (payload.force) {
      await purgeUserNow(userId, "force_user");
      return buildSignedOutResponse({
        ok: true,
        purgedNow: true,
        graceDays: 0,
      });
    }

    // ── Soft-delete path ──────────────────────────────────────────────
    if (user.deletedAt) {
      // Idempotent: the account is already pending deletion. Surface the
      // scheduled-for date so the client can route to the public
      // confirmation page without a second round-trip.
      const scheduledFor = getDeletionScheduledFor(user.deletedAt);
      return buildSignedOutResponse({
        ok: true,
        alreadyPending: true,
        scheduledFor: scheduledFor.toISOString(),
        graceDays: ACCOUNT_DELETION_GRACE_DAYS,
      });
    }

    await cancelStripeSubscriptionForUser(
      user.id,
      user.stripeCustomerId,
      user.subscriptionStatus,
    );

    const deletedAt = new Date();
    await db.user.update({
      where: { id: userId },
      data: { deletedAt, deletionRemindersSent: 0 },
    });
    log.info("account_soft_deleted", {
      userId,
      scheduledFor: getDeletionScheduledFor(deletedAt).toISOString(),
    });

    return buildSignedOutResponse({
      ok: true,
      alreadyPending: false,
      scheduledFor: getDeletionScheduledFor(deletedAt).toISOString(),
      graceDays: ACCOUNT_DELETION_GRACE_DAYS,
    });
  });
}

/**
 * Wraps the JSON payload in a 200 response that wipes the NextAuth session
 * cookie and the locale cookie so the next page load lands on `/`. Used by
 * both the "freshly soft-deleted" and the idempotent "already pending"
 * branches of DELETE.
 */
function buildSignedOutResponse(
  payload: Record<string, unknown>,
): NextResponse {
  const response = NextResponse.json(payload, { status: 200 });
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

