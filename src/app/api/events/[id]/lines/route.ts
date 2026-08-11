import { attachLineToEvent } from "@/lib/events";
import { jsonError, withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { eventAttachLineSchema } from "@/lib/validators";

/**
 * POST /api/events/[id]/lines — engancha una `MonthExpenseLine` al evento.
 * A click in the UI is explicit user intent, so out-of-range attaches are
 * allowed and returned with `outOfRange: true` for the UI to highlight.
 * The chat agent / MCP must not auto-attach out-of-range lines (see
 * `attachLineToEvent` / `allowOutOfRange`).
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
        // Dashboard / month list: the user picked the wallet themselves.
        allowOutOfRange: true,
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
