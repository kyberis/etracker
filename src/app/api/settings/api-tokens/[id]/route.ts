import { db } from "@/lib/db";
import { withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { id } = await context.params;

    // updateMany lets us scope by both id + userId in a single query so a
    // user can never revoke another user's token.
    const { count } = await db.apiToken.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (count === 0) {
      throw new Error("USER_NOT_FOUND");
    }

    return { ok: true };
  });
}
