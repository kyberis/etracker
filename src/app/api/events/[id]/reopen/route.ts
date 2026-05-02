import { reopenEvent } from "@/lib/events";
import { jsonError, withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";

/**
 * POST /api/events/[id]/reopen — revierte el cierre del evento. Si estaba
 * cerrado en LUMP_SUM, devuelve cada línea a su mes real (por
 * `occurredOn`).
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { id } = await context.params;
    try {
      const event = await reopenEvent({ userId, eventId: id });
      if (!event) return jsonError("Event not found.", 404);
      return { event };
    } catch (error) {
      if (error instanceof Error && error.message === "EVENT_NOT_CLOSED") {
        return jsonError("El evento no está cerrado.", 409);
      }
      throw error;
    }
  });
}
