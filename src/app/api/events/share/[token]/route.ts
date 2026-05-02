import { db } from "@/lib/db";
import { verifyShareToken } from "@/lib/events-share";
import { jsonError, withApi } from "@/lib/http";
import { getOptionalUserId } from "@/lib/session";

/**
 * GET /api/events/share/[token]
 *
 * Public endpoint: no auth required. Returns just enough metadata for
 * the landing page to render a friendly "Marcos te invitó a Mendoza
 * Trip" preview WITHOUT exposing the event's expense lines or financial
 * details (those are gated behind accept). When the caller is logged
 * in, also tells them whether they're already a participant so the
 * landing can show a "Ir al evento" link instead of "Unirme".
 *
 * Cache-Control: noStore is implicit because this hits the database on
 * every request. Don't add caching here — `lastUsedAt` would lie.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  return withApi(async () => {
    const { token } = await context.params;
    const verified = await verifyShareToken(token);
    if (!verified.ok) {
      // We use 410 (Gone) for revoked/expired so the landing can
      // distinguish "wrong link" (404) from "the link has been
      // intentionally killed" (410) without parsing the message.
      const status = verified.reason === "not_found" ? 404 : 410;
      return jsonError(verified.reason, status);
    }

    const event = await db.event.findUnique({
      where: { id: verified.eventId },
      select: {
        id: true,
        name: true,
        color: true,
        startDate: true,
        endDate: true,
        status: true,
        userId: true,
        user: { select: { name: true, email: true } },
      },
    });
    if (!event) {
      // Event was deleted after the token was minted (cascade should
      // have killed the token but defend anyway).
      return jsonError("not_found", 404);
    }

    const callerUserId = await getOptionalUserId();
    let alreadyJoined = false;
    if (callerUserId) {
      // Treat owner as "already joined" too — the UI should send them
      // straight to /events/[id] without showing the accept form.
      if (event.userId === callerUserId) {
        alreadyJoined = true;
      } else {
        const part = await db.eventParticipant.findUnique({
          where: {
            eventId_userId: {
              eventId: event.id,
              userId: callerUserId,
            },
          },
          select: { removedAt: true },
        });
        alreadyJoined = Boolean(part && part.removedAt === null);
      }
    }

    return {
      event: {
        id: event.id,
        name: event.name,
        color: event.color,
        startDate: event.startDate.toISOString().slice(0, 10),
        endDate: event.endDate
          ? event.endDate.toISOString().slice(0, 10)
          : null,
        status: event.status,
      },
      owner: {
        // Email-local-part fallback so we never leak the address to a
        // random visitor with the link.
        displayName: pickOwnerName(event.user),
      },
      callerSession: callerUserId
        ? { userId: callerUserId, alreadyJoined }
        : null,
      expiresAt: verified.expiresAt.toISOString(),
    };
  });
}

function pickOwnerName(
  user: { name: string | null; email: string } | null,
): string {
  if (!user) return "Tu organizador";
  if (user.name && user.name.trim().length > 0) return user.name.trim();
  return user.email.split("@")[0] || "Tu organizador";
}
