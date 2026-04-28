import { mergePendingTemplateLinesIntoMonth } from "@/lib/month-bucket";
import { withApi } from "@/lib/http";
import { parseMonthKey } from "@/lib/months";
import { requireUserId } from "@/lib/session";
import { monthParamSchema } from "@/lib/validators";
import { expireYearTimeline } from "@/lib/year-timeline-data";

export async function POST(
  _request: Request,
  context: { params: Promise<{ month: string }> },
) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { month: monthParam } = await context.params;
    const { month: monthKey } = monthParamSchema.parse({ month: monthParam });

    const result = await mergePendingTemplateLinesIntoMonth(userId, monthKey);
    await expireYearTimeline(userId, parseMonthKey(monthKey).getUTCFullYear());
    return result;
  });
}
