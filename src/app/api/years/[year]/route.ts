import { withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { getYearTimelineData } from "@/lib/year-timeline-data";
import { yearParamSchema } from "@/lib/validators";

export async function GET(_request: Request, context: { params: Promise<{ year: string }> }) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { year: yearParam } = await context.params;
    const { year } = yearParamSchema.parse({ year: yearParam });
    return getYearTimelineData(userId, year);
  });
}
