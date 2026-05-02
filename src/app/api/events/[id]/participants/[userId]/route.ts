import { removeParticipant } from "@/lib/events";
import { jsonError, withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";

/**
 * DELETE /api/events/[id]/participants/[userId]
 *
 * Soft-remove a participant. OWNER-only. Refuses to remove the OWNER
 * themselves (we don't support transferring ownership). Idempotent.
 *
 * Lines that the removed participant had paid keep their `paidByUserId`
 * pointing at them — `computeSettlement` then falls back to attributing
 * those amounts to the OWNER so the total still closes.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; userId: string }> },
) {
  return withApi(async () => {
    const callerUserId = await requireUserId();
    const { id, userId } = await context.params;
    const result = await removeParticipant({
      eventId: id,
      userId,
      callerUserId,
    });
    if (!result.ok) {
      if (result.reason === "not_found") {
        return jsonError("Participant or event not found.", 404);
      }
      if (result.reason === "cannot_remove_owner") {
        return jsonError("Cannot remove the event owner.", 409);
      }
      return jsonError("Forbidden.", 403);
    }
    return { ok: true };
  });
}
