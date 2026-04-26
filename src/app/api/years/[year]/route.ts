import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { jsonError } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { getYearTimelineData } from "@/lib/year-timeline-data";
import { yearParamSchema } from "@/lib/validators";

export async function GET(_request: Request, context: { params: Promise<{ year: string }> }) {
  try {
    const userId = await requireUserId();
    const { year: yearParam } = await context.params;
    const { year } = yearParamSchema.parse({ year: yearParam });
    const data = await getYearTimelineData(userId, year);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid year.", 400);
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    if (error instanceof Error && error.message.includes("Invalid month format")) {
      return jsonError("Invalid year or month key.", 400);
    }
    return jsonError("Unable to load year timeline.", 500);
  }
}
