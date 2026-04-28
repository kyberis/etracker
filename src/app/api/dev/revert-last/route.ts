import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";

/**
 * Dev-only: deletes the most recent expense-y mutation for the calling user.
 *
 * Picks, in order: latest `MonthExpenseLine`, then latest `Expense` template.
 * No-op (200 with `nothingToRevert: true`) if neither exists.
 *
 * Gated by `NODE_ENV !== "production"` so this never ships to prod even if
 * the route file is bundled. Auth is still required so a stray dev-mode
 * deploy can't be hit anonymously.
 */
export async function POST() {
  return withApi(async () => {
    if (process.env.NODE_ENV === "production") {
      return jsonError("Not found.", 404);
    }
    const userId = await requireUserId();

    const latestLine = await db.monthExpenseLine.findFirst({
      where: { monthRecord: { userId } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        amount: true,
        createdAt: true,
        monthRecord: { select: { month: true } },
      },
    });

    const latestTemplate = await db.expense.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, amount: true, createdAt: true },
    });

    const lineWins =
      !!latestLine &&
      (!latestTemplate || latestLine.createdAt > latestTemplate.createdAt);

    if (lineWins && latestLine) {
      await db.monthExpenseLine.delete({ where: { id: latestLine.id } });
      return {
        ok: true as const,
        reverted: {
          type: "monthExpenseLine" as const,
          id: latestLine.id,
          name: latestLine.name,
          amount: latestLine.amount.toString(),
        },
      };
    }

    if (latestTemplate) {
      await db.expense.delete({ where: { id: latestTemplate.id } });
      return {
        ok: true as const,
        reverted: {
          type: "expenseTemplate" as const,
          id: latestTemplate.id,
          name: latestTemplate.name,
          amount: latestTemplate.amount.toString(),
        },
      };
    }

    return { ok: true as const, nothingToRevert: true as const };
  });
}
