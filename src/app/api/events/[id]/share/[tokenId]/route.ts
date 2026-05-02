import { revokeShareToken } from "@/lib/events-share";
import { jsonError, withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";

/**
 * DELETE /api/events/[id]/share/[tokenId]
 *
 * Revoke a share-token. After revocation any open landing page reload
 * will show "this invite was revoked"; tabs that already accepted are
 * unaffected (the participant row stays). Idempotent: revoking an
 * already-revoked token returns 200.
 *
 * `[id]` (eventId) is unused at the route layer — the underlying
 * `revokeShareToken` checks ownership through the token's own
 * `event.userId`. We still take it in the path so the URL composes
 * naturally with the share-token list above.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; tokenId: string }> },
) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { tokenId } = await context.params;
    const result = await revokeShareToken({
      tokenId,
      callerUserId: userId,
    });
    if (!result.ok) {
      if (result.reason === "not_found") {
        return jsonError("Token not found.", 404);
      }
      return jsonError("Forbidden.", 403);
    }
    return { ok: true };
  });
}
