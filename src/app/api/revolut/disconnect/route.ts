import { db } from "@/lib/db";
import { withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";

export async function DELETE() {
  return withApi(async () => {
    const userId = await requireUserId();
    await db.revolutConnection.deleteMany({ where: { userId } });
    return { ok: true as const };
  });
}
