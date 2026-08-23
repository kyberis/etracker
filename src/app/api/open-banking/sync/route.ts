import { z } from "zod";

import { syncConnection } from "@/lib/bank-sync/sync-connection";
import { getConnectionForUser, listUserConnections } from "@/lib/db/bank-connections";
import { assertOpenBankingAvailable } from "@/lib/enable-banking/access";
import { withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";

const bodySchema = z.object({
  connectionId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    await assertOpenBankingAvailable(userId);
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const psu = {
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
    };

    if (body.connectionId) {
      const existing = await getConnectionForUser(userId, body.connectionId);
      if (!existing) throw new Error("CONNECTION_NOT_FOUND");
      return {
        results: [await syncConnection({ connectionId: existing.id, trigger: "manual", psu })],
      };
    }

    const connections = await listUserConnections(userId);
    const results = [];
    for (const connection of connections) {
      if (connection.status === "NEEDS_REAUTH" || connection.status === "DISCONNECTED") {
        continue;
      }
      results.push(
        await syncConnection({
          connectionId: connection.id,
          trigger: "manual",
          psu,
        }),
      );
    }
    return { results };
  });
}
