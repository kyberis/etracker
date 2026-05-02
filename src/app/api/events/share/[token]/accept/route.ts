import { UserKind } from "@prisma/client";

import { db } from "@/lib/db";
import {
  addParticipant,
  isEventOwner,
} from "@/lib/events";
import {
  markShareTokenUsed,
  verifyShareToken,
} from "@/lib/events-share";
import { jsonError, withApi } from "@/lib/http";
import { limitByIp } from "@/lib/rate-limit";
import { getOptionalUserId } from "@/lib/session";
import {
  buildTelegramDeepLink,
  generateTelegramLinkCode,
} from "@/lib/telegram/link";
import { eventShareAcceptSchema } from "@/lib/validators";

/**
 * POST /api/events/share/[token]/accept
 *
 * Two flavors picked by `body.mode`:
 *
 * - `mode = "registered"`: the visitor is logged in (we 401 otherwise).
 *   We just upsert an EventParticipant row for their existing User and
 *   send them to `/events/[id]`.
 *
 * - `mode = "guest"`: anonymous accept. We mint a brand-new
 *   `User(kind = GUEST)` with a synthetic email, attach an
 *   EventParticipant row, generate a one-time `telegramLinkCode`, and
 *   return the `t.me/<bot>?start=<code>` deep link. The webhook
 *   completes the link when the user taps Start.
 *
 * The route is wrapped in a per-IP rate limit because it's
 * unauthenticated and would otherwise be a free-account-creation
 * surface (synthetic emails are unique by cuid so DB-side collision is
 * statistically impossible, but we don't want a script writing 10k
 * GUEST users).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  return withApi(async () => {
    const limited = await limitByIp(
      request,
      "events-share-accept",
      30,
      "10 m",
      "Too many join attempts. Please try again in a few minutes.",
    );
    if (!limited.ok) return limited.response;

    const { token } = await context.params;
    const verified = await verifyShareToken(token);
    if (!verified.ok) {
      const status = verified.reason === "not_found" ? 404 : 410;
      return jsonError(verified.reason, status);
    }

    const event = await db.event.findUnique({
      where: { id: verified.eventId },
      select: {
        id: true,
        userId: true,
        name: true,
        user: { select: { name: true, email: true } },
      },
    });
    if (!event) return jsonError("not_found", 404);

    const body = await request.json();
    const payload = eventShareAcceptSchema.parse(body);

    const callerUserId = await getOptionalUserId();

    if (payload.mode === "registered") {
      if (!callerUserId) {
        return jsonError("Sign in first.", 401);
      }
      // Owners don't need to "accept" — short-circuit so the UI can just
      // bounce them to /events/[id].
      const owner = await isEventOwner({ userId: callerUserId, eventId: event.id });
      if (owner) {
        await markShareTokenUsed(verified.tokenId);
        return {
          mode: "registered" as const,
          eventId: event.id,
          alreadyJoined: true,
        };
      }
      // Snapshot the caller's display name. We refuse to overwrite an
      // existing one inside `addParticipant` if it's already set, but
      // the caller-supplied value wins on first join.
      const caller = await db.user.findUnique({
        where: { id: callerUserId },
        select: { name: true, email: true },
      });
      const displayName =
        payload.displayName?.trim() ||
        (caller?.name?.trim()) ||
        (caller?.email.split("@")[0] ?? "Guest");
      await addParticipant({
        eventId: event.id,
        userId: callerUserId,
        displayName,
      });
      await markShareTokenUsed(verified.tokenId);
      return {
        mode: "registered" as const,
        eventId: event.id,
        alreadyJoined: false,
      };
    }

    // ---- guest mode --------------------------------------------------
    // We require the caller to be ANONYMOUS for the guest branch; an
    // already-logged-in user accidentally hitting this would otherwise
    // create a phantom GUEST account they'd never see.
    if (callerUserId) {
      return jsonError(
        "You are already signed in. Use the registered join flow instead.",
        409,
      );
    }

    const linkCode = generateTelegramLinkCode();
    const synthEmail = buildSyntheticGuestEmail();
    const guest = await db.user.create({
      data: {
        kind: UserKind.GUEST,
        email: synthEmail,
        name: payload.displayName,
        // Skip Terms gate: the GUEST never lands in `/app`. The upgrade
        // endpoint is what actually requires Terms acceptance later.
        // GUESTs are NOT admins and inherit the default agent quota.
        ...(payload.locale ? { locale: payload.locale } : {}),
      },
      select: { id: true },
    });

    await addParticipant({
      eventId: event.id,
      userId: guest.id,
      displayName: payload.displayName,
      telegramLinkCode: linkCode,
    });
    await markShareTokenUsed(verified.tokenId);

    return {
      mode: "guest" as const,
      eventId: event.id,
      guestUserId: guest.id,
      // The landing page redirects to this URL so Telegram opens with
      // the Start button pre-armed. Once the user taps Start, the
      // webhook consumes `linkCode` and welcomes them in chat.
      telegramDeepLink: buildTelegramDeepLink(linkCode),
    };
  });
}

/**
 * `guest+<cuid>@guest.clara.local` — synthetic so we don't violate the
 * unique constraint on `User.email` and so we can spot guest accounts
 * by suffix in admin tools. The localpart is random enough that two
 * concurrent inserts colliding is statistically impossible.
 */
function buildSyntheticGuestEmail(): string {
  // Use the same alphabet as cuid (random base36) so the email passes
  // basic format validators downstream. We don't need the cuid module
  // here — `crypto.randomUUID` is fine.
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  return `guest+${random}@guest.clara.local`;
}
