import {
  mergePendingTemplateIncomeLinesIntoMonth,
  mergePendingTemplateLinesIntoMonth,
} from "@/lib/month-bucket";
import { withApi } from "@/lib/http";
import { parseMonthKey } from "@/lib/months";
import { requireUserId } from "@/lib/session";
import { monthParamSchema } from "@/lib/validators";
import { expireYearTimeline } from "@/lib/year-timeline-data";

/**
 * Vuelca al mes las plantillas vigentes (gastos + ingresos) que todavía no
 * tienen línea materializada. Idempotente. Devuelve el conteo separado por
 * cada pata para que la UI pueda dar feedback granular.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ month: string }> },
) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { month: monthParam } = await context.params;
    const { month: monthKey } = monthParamSchema.parse({ month: monthParam });

    const [expensesResult, incomesResult] = await Promise.all([
      mergePendingTemplateLinesIntoMonth(userId, monthKey),
      mergePendingTemplateIncomeLinesIntoMonth(userId, monthKey),
    ]);
    await expireYearTimeline(userId, parseMonthKey(monthKey).getUTCFullYear());
    return {
      added: expensesResult.added,
      addedExpenses: expensesResult.added,
      addedIncomes: incomesResult.added,
    };
  });
}
