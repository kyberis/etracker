import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { runRevolutSyncForMonth } from "@/lib/revolut/sync";
import { requireUserId } from "@/lib/session";
import { revolutSyncSchema } from "@/lib/validators";

export async function POST(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const body = await request.json();
    const payload = revolutSyncSchema.parse(body);

    const connection = await db.revolutConnection.findUnique({
      where: { userId },
      include: { ignoredTxs: { select: { transactionId: true } } },
    });

    if (!connection?.accountId) {
      return jsonError("Revolut no está vinculado o falta la cuenta.", 400);
    }

    const ignoredTransactionIds = new Set(
      connection.ignoredTxs.map((i) => i.transactionId),
    );

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { expenseImportInstructions: true },
    });

    return runRevolutSyncForMonth({
      userId,
      connectionId: connection.id,
      accountId: connection.accountId,
      monthKey: payload.month,
      ignoredTransactionIds,
      expenseImportInstructions: user?.expenseImportInstructions,
    });
  });
}
