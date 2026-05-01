import { z } from "zod";

import { db } from "@/lib/db";
import { withApi } from "@/lib/http";
import { requireAdminUserId } from "@/lib/session";

/**
 * Admin-only mutations on a `ContactMessage` row. The bandeja UI calls this
 * to flip `readAt`, `repliedAt` and `archivedAt`. Each field accepts:
 *  - an ISO string (mark stamped now or backfilled),
 *  - `null` (un-mark, useful when the admin clicked the wrong button).
 *
 * Body of the message itself is intentionally NOT editable here — incoming
 * messages are immutable to keep the audit trail intact.
 */
const patchSchema = z
  .object({
    readAt: z.union([z.string().datetime(), z.null()]).optional(),
    repliedAt: z.union([z.string().datetime(), z.null()]).optional(),
    archivedAt: z.union([z.string().datetime(), z.null()]).optional(),
  })
  .refine(
    (data) =>
      data.readAt !== undefined ||
      data.repliedAt !== undefined ||
      data.archivedAt !== undefined,
    { message: "Nada para actualizar." },
  );

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    await requireAdminUserId();
    const { id } = await ctx.params;
    const body = await request.json();
    const payload = patchSchema.parse(body);

    const data: Record<string, Date | null> = {};
    if (payload.readAt !== undefined) {
      data.readAt = payload.readAt ? new Date(payload.readAt) : null;
    }
    if (payload.repliedAt !== undefined) {
      data.repliedAt = payload.repliedAt ? new Date(payload.repliedAt) : null;
    }
    if (payload.archivedAt !== undefined) {
      data.archivedAt = payload.archivedAt ? new Date(payload.archivedAt) : null;
    }

    const updated = await db.contactMessage.update({
      where: { id },
      data,
      select: {
        id: true,
        readAt: true,
        repliedAt: true,
        archivedAt: true,
      },
    });
    return {
      id: updated.id,
      readAt: updated.readAt?.toISOString() ?? null,
      repliedAt: updated.repliedAt?.toISOString() ?? null,
      archivedAt: updated.archivedAt?.toISOString() ?? null,
    };
  });
}
