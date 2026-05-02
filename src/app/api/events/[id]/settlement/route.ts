import { computeSettlement, isEventParticipant } from "@/lib/events";
import { jsonError, withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";

/**
 * GET /api/events/[id]/settlement
 *
 * Live preview of who-owes-who. The same engine that runs at close
 * time, computed against the current state — useful for the "Vista
 * previa" card on the event detail page so participants can see a
 * draft of the split before the owner clicks "Cerrar billetera".
 *
 * Visible to any active participant. The amounts are denominated in
 * the OWNER's primaryCurrency (lines are stored pre-converted).
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
    const settlement = await computeSettlement(id);
    if (!settlement) return jsonError("Event not found.", 404);
    return { settlement };
  });
}
