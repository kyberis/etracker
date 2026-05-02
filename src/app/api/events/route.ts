import { EventStatus } from "@prisma/client";

import {
  createEvent,
  listEvents,
} from "@/lib/events";
import { parseIsoDate } from "@/lib/expense-line";
import { jsonError, withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { eventCreateSchema } from "@/lib/validators";

/**
 * GET /api/events?status=OPEN|CLOSED — lista las billeteras de evento del
 * usuario. Sin filtro devuelve abiertos primero, después cerrados.
 */
export async function GET(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status");
    let status: EventStatus | undefined;
    if (statusParam) {
      if (statusParam === "OPEN") status = EventStatus.OPEN;
      else if (statusParam === "CLOSED") status = EventStatus.CLOSED;
      else return jsonError("status must be OPEN or CLOSED.", 400);
    }
    const events = await listEvents(userId, status ? { status } : {});
    return { events };
  });
}

/**
 * POST /api/events — crea una billetera de evento.
 */
export async function POST(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const body = await request.json();
    const payload = eventCreateSchema.parse(body);

    const startDate = parseIsoDate(payload.startDate);
    if (!startDate) return jsonError("Invalid startDate (yyyy-MM-dd).", 400);
    const endDate = payload.endDate ? parseIsoDate(payload.endDate) : null;
    if (payload.endDate && !endDate) {
      return jsonError("Invalid endDate (yyyy-MM-dd).", 400);
    }

    const event = await createEvent({
      userId,
      name: payload.name,
      startDate,
      endDate: endDate ?? null,
      color: payload.color ?? null,
      attributionMode: payload.attributionMode,
    });
    return new Response(JSON.stringify({ event }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  });
}
