import { isEventParticipant, listParticipants } from "@/lib/events";
import { jsonError, withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";

/**
 * GET /api/events/[id]/participants
 *
 * Returns the active roster (OWNER + GUESTs) for the event. Visible to
 * any active participant — an organizer wants to see who's in, and an
 * invited guest needs the list to answer the AI's "who paid?" prompt.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { id } = await context.params;
    const allowed = await isEventParticipant({ userId, eventId: id });
    if (!allowed) return jsonError("Forbidden.", 403);
    const participants = await listParticipants({ eventId: id });
    return { participants };
  });
}
