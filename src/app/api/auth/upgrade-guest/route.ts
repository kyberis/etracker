import bcrypt from "bcrypt";
import { UserKind } from "@prisma/client";

import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { CURRENT_TERMS_VERSION } from "@/lib/legal";
import { limitByIp } from "@/lib/rate-limit";
import { guestUpgradeSchema } from "@/lib/validators";

/**
 * POST /api/auth/upgrade-guest
 *
 * Convert a Telegram-only `UserKind = GUEST` account into a full
 * `UserKind = REGULAR` account by setting an email + password and
 * accepting the current Terms.
 *
 * Trust model: the request must include the synthetic `guestUserId` we
 * issued at share-link accept time. We also require Telegram to already be
 * linked on that account — which proves the caller controls the Telegram
 * chat the upgrade CTA was sent to (the only place we expose the
 * `guestUserId` to anyone). This is intentionally lightweight; the data
 * the GUEST owns is trip-only and doesn't justify a full email-magic-link
 * dance for now.
 *
 * Idempotency: calling this on an already-upgraded user returns 409 with
 * a message asking them to sign in instead.
 */
export async function POST(request: Request) {
  return withApi(async () => {
    const limited = await limitByIp(
      request,
      "auth-upgrade-guest",
      5,
      "15 m",
      "Too many upgrade attempts. Try again in a few minutes.",
    );
    if (!limited.ok) return limited.response;

    const body = await request.json();
    const payload = guestUpgradeSchema.parse(body);

    if (payload.acceptedTermsVersion !== CURRENT_TERMS_VERSION) {
      return jsonError(
        "You must accept the current Terms and Privacy Policy.",
        400,
      );
    }

    const guest = await db.user.findUnique({
      where: { id: payload.guestUserId },
      select: {
        id: true,
        kind: true,
        email: true,
        telegramVerifiedAt: true,
      },
    });
    if (!guest) {
      return jsonError("Guest account not found.", 404);
    }
    if (guest.kind !== UserKind.GUEST) {
      return jsonError(
        "This account is already a regular Clara account. Sign in with your existing credentials.",
        409,
      );
    }
    // Telegram must be linked: this is our anti-impersonation gate. Anyone
    // could mash random userIds; only someone who actually got the upgrade
    // CTA in their Telegram chat would have linked the account.
    if (!guest.telegramVerifiedAt) {
      return jsonError(
        "Link Telegram first by tapping the join link the organiser sent you.",
        409,
      );
    }

    // Refuse if the target email is already taken (another account would
    // collide on the unique constraint).
    const existingWithEmail = await db.user.findUnique({
      where: { email: payload.email },
      select: { id: true },
    });
    if (existingWithEmail && existingWithEmail.id !== guest.id) {
      return jsonError(
        "That email is already in use by another account. Sign in with that account, then connect Telegram from Settings to merge.",
        409,
      );
    }

    const passwordHash = await bcrypt.hash(payload.password, 12);

    const updated = await db.user.update({
      where: { id: guest.id },
      data: {
        email: payload.email,
        passwordHash,
        kind: UserKind.REGULAR,
        acceptedTermsAt: new Date(),
        acceptedTermsVersion: payload.acceptedTermsVersion,
        ...(payload.locale ? { locale: payload.locale } : {}),
      },
      select: { id: true, email: true, kind: true },
    });

    return {
      ok: true as const,
      user: { id: updated.id, email: updated.email, kind: updated.kind },
    };
  });
}
