import { attachLineToEvent } from "@/lib/events";
import { jsonError, withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { eventAttachLineSchema } from "@/lib/validators";

/**
 * POST /api/events/[id]/lines — engancha una `MonthExpenseLine` al evento.
 * Cuando la fecha del gasto cae fuera del rango del evento devuelve un
 * `outOfRange: true` informativo (igual lo asocia, pero la UI / agente
 * pueden destacar que está fuera del viaje).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { id } = await context.params;
    const body = await request.json();
    const payload = eventAttachLineSchema.parse(body);
    try {
      const result = await attachLineToEvent({
        userId,
        eventId: id,
        lineId: payload.lineId,
      });
      if (!result.ok) return jsonError("Event or line not found.", 404);
      return { ok: true, outOfRange: result.outOfRange ?? false };
    } catch (error) {
      if (error instanceof Error && error.message === "EVENT_CLOSED") {
        return jsonError(
          "Event is closed. Reopen it before adding expenses.",
          409,
        );
      }
      throw error;
    }
  });
}
