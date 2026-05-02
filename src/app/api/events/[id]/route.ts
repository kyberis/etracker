import {
  deleteEvent,
  getEvent,
  updateEvent,
} from "@/lib/events";
import { parseIsoDate } from "@/lib/expense-line";
import { jsonError, withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { eventUpdateSchema } from "@/lib/validators";

/**
 * GET /api/events/[id] — devuelve una billetera de evento con totales y
 * cantidad de líneas asociadas.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { id } = await context.params;
    const event = await getEvent(userId, id);
    if (!event) return jsonError("Event not found.", 404);
    return { event };
  });
}

/**
 * PATCH /api/events/[id] — solo eventos OPEN. Para cerrar usar
 * `/api/events/[id]/close`.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { id } = await context.params;
    const body = await request.json();
    const payload = eventUpdateSchema.parse(body);

    let startDate: Date | undefined;
    if (payload.startDate !== undefined) {
      const parsed = parseIsoDate(payload.startDate);
      if (!parsed) return jsonError("Invalid startDate (yyyy-MM-dd).", 400);
      startDate = parsed;
    }
    let endDate: Date | null | undefined;
    if (payload.endDate !== undefined) {
      if (payload.endDate === null) {
        endDate = null;
      } else {
        const parsed = parseIsoDate(payload.endDate);
        if (!parsed) return jsonError("Invalid endDate (yyyy-MM-dd).", 400);
        endDate = parsed;
      }
    }

    let color: string | null | undefined;
    if (payload.color !== undefined) {
      color =
        payload.color === null || payload.color === ""
          ? null
          : payload.color;
    }

    try {
      const event = await updateEvent({
        userId,
        eventId: id,
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(startDate !== undefined ? { startDate } : {}),
        ...(endDate !== undefined ? { endDate } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(payload.attributionMode !== undefined
          ? { attributionMode: payload.attributionMode }
          : {}),
      });
      if (!event) return jsonError("Event not found.", 404);
      return { event };
    } catch (error) {
      if (error instanceof Error && error.message === "EVENT_CLOSED") {
        return jsonError(
          "El evento está cerrado. Reabrilo primero para editarlo.",
          409,
        );
      }
      if (error instanceof Error && error.message === "EVENT_INVALID_RANGE") {
        return jsonError("endDate must be after startDate.", 400);
      }
      throw error;
    }
  });
}

/**
 * DELETE /api/events/[id] — borra el evento. Las líneas asociadas pierden
 * el `eventId` (FK con `onDelete: SetNull`) y vuelven a aparecer como
 * gastos sueltos en su mes original.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { id } = await context.params;
    const result = await deleteEvent(userId, id);
    if (!result.ok) return jsonError("Event not found.", 404);
    return { ok: true, detachedLineCount: result.detachedLineCount };
  });
}
