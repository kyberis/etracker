import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";

/**
 * Dev-only: wipes a user's data without deleting the account itself, so
 * the next chat visit behaves like a fresh registration (welcome message,
 * empty months, no banks, no expenses, no chat history).
 *
 * Order matters because of `onDelete: Restrict` on Bank → MonthExpenseLine
 * and Bank → Expense: lines and templates have to go before the banks they
 * point at. Everything else cascades from `User` already, but we run the
 * deletes explicitly inside a transaction so a partial failure never leaves
 * the account half-reset.
 *
 * Gated by `NODE_ENV !== "production"` and by auth — the latter so even a
 * misconfigured dev deploy isn't anonymously destructive.
 */
export async function POST() {
  return withApi(async () => {
    if (process.env.NODE_ENV === "production") {
      return jsonError("Not found.", 404);
    }
    const userId = await requireUserId();

    await db.$transaction([
      db.monthExpenseLine.deleteMany({ where: { monthRecord: { userId } } }),
      db.monthRecord.deleteMany({ where: { userId } }),
      db.expense.deleteMany({ where: { userId } }),
      db.bank.deleteMany({ where: { userId } }),
      db.webChatMessage.deleteMany({ where: { userId } }),
      db.webChatSession.deleteMany({ where: { userId } }),
      db.webChatSession.deleteMany({ where: { userId } }),
      db.telegramMessage.deleteMany({ where: { userId } }),
      db.agentMessageUsage.deleteMany({ where: { userId } }),
      db.user.update({
        where: { id: userId },
        data: {
          welcomedAt: null,
          monthlyIncome: 0,
          expenseImportInstructions: null,
          primaryCurrency: "USD",
          primaryCurrencyConfirmedAt: null,
        },
      }),
    ]);

    return { ok: true as const };
  });
}
