import { db } from "@/lib/db";
import { withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";

export async function GET() {
  return withApi(async () => {
    const userId = await requireUserId();
    const connection = await db.revolutConnection.findUnique({
      where: { userId },
      select: {
        status: true,
        institutionId: true,
        accountId: true,
        lastSyncAt: true,
        defaultImportBankId: true,
        requisitionId: true,
      },
    });

    if (!connection) {
      return { connected: false as const };
    }

    const linked = Boolean(connection.accountId);

    return {
      connected: true as const,
      linked,
      pending: !linked,
      institutionId: connection.institutionId,
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
      defaultImportBankId: connection.defaultImportBankId,
    };
  });
}
