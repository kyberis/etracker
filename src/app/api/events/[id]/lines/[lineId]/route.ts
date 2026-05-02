import { detachLineFromEvent } from "@/lib/events";
import { jsonError, withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";

/**
 * DELETE /api/events/[id]/lines/[lineId] — desengancha una línea del evento.
 * No borra la línea, solo pone `eventId = null`. La línea queda como un
 * gasto suelto en su `MonthRecord` original.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; lineId: string }> },
) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { lineId } = await context.params;
    const result = await detachLineFromEvent({ userId, lineId });
    if (!result.ok) return jsonError("Line not found.", 404);
    return { ok: true };
  });
}
