import { isEventOwner } from "@/lib/events";
import {
  buildShareUrl,
  listShareTokens,
  mintShareToken,
} from "@/lib/events-share";
import { jsonError, withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";

/**
 * GET /api/events/[id]/share
 *
 * Lists all share-tokens minted for this event (active + revoked +
 * expired). The plaintext token is NEVER returned — we only stored the
 * hash. The UI uses this to show "Active link" / "Revoked" rows so the
 * owner can spot stale invites.
 *
 * Owner-only: only the event creator can see (or care about) the token
 * inventory. Other participants get 403.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { id } = await context.params;
    const owner = await isEventOwner({ userId, eventId: id });
    if (!owner) return jsonError("Forbidden.", 403);
    const tokens = await listShareTokens(id);
    return {
      tokens: tokens.map((t) => ({
        id: t.id,
        expiresAt: t.expiresAt.toISOString(),
        revokedAt: t.revokedAt ? t.revokedAt.toISOString() : null,
        lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
        createdAt: t.createdAt.toISOString(),
        // Status discriminator for the UI ("Active" / "Expired" / "Revoked").
        status: t.revokedAt
          ? ("revoked" as const)
          : t.expiresAt.getTime() <= Date.now()
            ? ("expired" as const)
            : ("active" as const),
      })),
    };
  });
}

/**
 * POST /api/events/[id]/share
 *
 * Mint a fresh share-token for the event. Returns the plaintext token
 * (the only time we'll ever surface it) and the public landing URL the
 * owner can share via WhatsApp / email / SMS.
 *
 * Owner-only. Idempotent in the sense that successive calls just
 * accumulate more active tokens; the owner can revoke any of them
 * individually with DELETE /share/[tokenId].
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { id } = await context.params;
    const owner = await isEventOwner({ userId, eventId: id });
    if (!owner) return jsonError("Forbidden.", 403);
    const minted = await mintShareToken({
      eventId: id,
      createdById: userId,
    });
    return {
      tokenId: minted.tokenId,
      // Plaintext token — DO NOT log or persist this anywhere else.
      token: minted.token,
      url: buildShareUrl(minted.token),
      expiresAt: minted.expiresAt.toISOString(),
    };
  });
}
