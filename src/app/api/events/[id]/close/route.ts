import { EventAttributionMode } from "@prisma/client";

import { closeEvent } from "@/lib/events";
import { jsonError, withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { eventCloseSchema } from "@/lib/validators";

/**
 * POST /api/events/[id]/close — cierra una billetera de evento.
 *
 * Body:
 * - `attributionMode`: BY_DATE | LUMP_SUM
 * - `attributionMonth` (yyyy-MM): obligatorio cuando mode = LUMP_SUM. Las
 *   líneas se mueven a ese mes en una sola transacción.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { id } = await context.params;
    const body = await request.json();
    const payload = eventCloseSchema.parse(body);

    try {
      const event = await closeEvent({
        userId,
        eventId: id,
        mode:
          payload.attributionMode === "LUMP_SUM"
            ? EventAttributionMode.LUMP_SUM
            : EventAttributionMode.BY_DATE,
        attributionMonth: payload.attributionMonth ?? null,
      });
      if (!event) return jsonError("Event not found.", 404);
      return { event };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "EVENT_ALREADY_CLOSED") {
          return jsonError("Event is already closed.", 409);
        }
        if (error.message === "EVENT_MISSING_ATTRIBUTION_MONTH") {
          return jsonError(
            "attributionMonth is required for LUMP_SUM.",
            400,
          );
        }
      }
      throw error;
    }
  });
}
