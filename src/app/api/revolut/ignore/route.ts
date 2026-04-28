import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { revolutIgnoreSchema } from "@/lib/validators";

export async function POST(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const body = await request.json();
    const payload = revolutIgnoreSchema.parse(body);

    const connection = await db.revolutConnection.findUnique({ where: { userId } });
    if (!connection) {
      return jsonError("No hay conexión Revolut.", 404);
    }

    await db.ignoredTransaction.createMany({
      data: payload.transactionIds.map((transactionId) => ({
        connectionId: connection.id,
        transactionId,
      })),
      skipDuplicates: true,
    });

    return { ok: true as const };
  });
}
