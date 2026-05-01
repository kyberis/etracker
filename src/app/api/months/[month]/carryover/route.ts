import { applyPrevMonthLeftoverDecision } from "@/lib/month-bucket";
import { jsonError, withApi } from "@/lib/http";
import { loadMonthPageData } from "@/lib/month-page-data";
import { parseMonthKey } from "@/lib/months";
import { requireUserId } from "@/lib/session";
import { carryoverDecisionSchema, monthParamSchema } from "@/lib/validators";
import { expireYearTimeline } from "@/lib/year-timeline-data";

/**
 * Records the user's decision about the previous month's leftover. Idempotent
 * by design: once `MonthRecord.carryoverDecidedAt` is set, further calls 409.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ month: string }> },
) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { month: monthParam } = await context.params;
    const { month: monthKey } = monthParamSchema.parse({ month: monthParam });
    const body = await request.json();
    const { mode } = carryoverDecisionSchema.parse(body);

    const result = await applyPrevMonthLeftoverDecision(userId, monthKey, mode);

    if (result.type === "noRecord") {
      return jsonError("Month not set up. Create the month first.", 404);
    }
    if (result.type === "alreadyDecided") {
      return jsonError("La decisión sobre el sobrante ya fue tomada.", 409);
    }
    if (result.type === "modeMismatch") {
      const message =
        result.expected === "leftover"
          ? "El mes anterior cerró con sobrante: usá addToIncome o setAside."
          : "El mes anterior cerró con deuda: usá coverFromSavings o carryDebt.";
      return jsonError(message, 400);
    }

    const year = parseMonthKey(monthKey).getUTCFullYear();
    await expireYearTimeline(userId, year);

    const data = await loadMonthPageData(userId, monthKey);
    return new Response(
      JSON.stringify({
        applied: result.type === "applied",
        leftover: result.type === "applied" ? result.leftover : 0,
        mode: result.type === "applied" ? result.mode : null,
        covered: result.type === "applied" ? (result.covered ?? null) : null,
        remainingDebt:
          result.type === "applied" ? (result.remainingDebt ?? null) : null,
        data,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
}
