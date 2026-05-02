import { UserKind } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * Per-user "what event is this guest scoped to?" lookup, used by the
 * Telegram webhook to decide whether to invoke the AI agent in
 * guest-event-scope mode.
 *
 * A `User.kind = GUEST` account is created with exactly ONE active
 * `EventParticipant` row (the event the link invited them to). If for
 * whatever reason a guest somehow ends up with zero or multiple active
 * participations, we return `null` and the webhook falls back to a
 * polite "this account isn't fully set up" message rather than hand
 * the LLM an ambiguous scope.
 */

export type GuestEventScope = {
  eventId: string;
  eventName: string;
  /** The display name the OWNER goes by in chat (snapshotted at create). */
  ownerDisplayName: string;
  /** Owner's primary currency — the trip is denominated in this. */
  primaryCurrency: string;
};

/**
 * Returns the single event a GUEST is allowed to operate on, or `null`
 * for REGULAR users (callers should ignore the result for them) and
 * for GUESTs whose state is malformed.
 */
export async function loadGuestEventScope(
  userId: string,
): Promise<GuestEventScope | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { kind: true },
  });
  if (!user || user.kind !== UserKind.GUEST) return null;

  const participations = await db.eventParticipant.findMany({
    where: { userId, removedAt: null },
    take: 2, // we only care if there are 0, 1, or many.
    select: {
      eventId: true,
      event: {
        select: {
          name: true,
          user: { select: { name: true, email: true, primaryCurrency: true } },
        },
      },
    },
  });
  if (participations.length !== 1) return null;
  const p = participations[0];
  const owner = p.event.user;
  return {
    eventId: p.eventId,
    eventName: p.event.name,
    ownerDisplayName: pickOwnerName(owner),
    primaryCurrency: owner.primaryCurrency,
  };
}

function pickOwnerName(
  user: { name: string | null; email: string },
): string {
  if (user.name && user.name.trim().length > 0) return user.name.trim();
  return user.email.split("@")[0] || "Owner";
}
