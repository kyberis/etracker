import { createMonthFromCopy, createMonthFromTemplates } from "@/lib/month-bucket";
import { jsonError, withApi } from "@/lib/http";
import { loadMonthPageData } from "@/lib/month-page-data";
import { parseMonthKey } from "@/lib/months";
import { requireUserId } from "@/lib/session";
import { createMonthSchema } from "@/lib/validators";
import { expireYearTimeline } from "@/lib/year-timeline-data";

export async function POST(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const body = await request.json();
    const payload = createMonthSchema.parse(body);

    if (payload.mode === "templates") {
      const result = await createMonthFromTemplates(userId, payload.month);
      if (result.type === "exists") {
        return jsonError("This month is already set up.", 409);
      }
    } else {
      const result = await createMonthFromCopy(
        userId,
        payload.month,
        payload.copyFromMonth!,
      );
      if (result.type === "exists") {
        return jsonError("This month is already set up.", 409);
      }
    }

    const year = parseMonthKey(payload.month).getUTCFullYear();
    await expireYearTimeline(userId, year);

    const data = await loadMonthPageData(userId, payload.month);
    return new Response(JSON.stringify(data), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  });
}
