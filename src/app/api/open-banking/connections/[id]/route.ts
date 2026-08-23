import { disconnectConnection, getConnectionForUser } from "@/lib/db/bank-connections";
import { assertOpenBankingAvailable } from "@/lib/enable-banking/access";
import { withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const userId = await requireUserId();
    await assertOpenBankingAvailable(userId);
    const { id } = await context.params;
    const existing = await getConnectionForUser(userId, id);
    if (!existing) {
      throw new Error("CONNECTION_NOT_FOUND");
    }
    await disconnectConnection(id);
    return { ok: true };
  });
}
