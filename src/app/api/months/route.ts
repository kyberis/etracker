import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { createMonthFromCopy, createMonthFromTemplates } from "@/lib/month-bucket";
import { loadMonthPageData } from "@/lib/month-page-data";
import { jsonError } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { createMonthSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const payload = createMonthSchema.parse(body);

    if (payload.mode === "templates") {
      const result = await createMonthFromTemplates(userId, payload.month);
      if (result.type === "exists") {
        return jsonError("This month is already set up.", 409);
      }
    } else {
      try {
        const result = await createMonthFromCopy(
          userId,
          payload.month,
          payload.copyFromMonth!,
        );
        if (result.type === "exists") {
          return jsonError("This month is already set up.", 409);
        }
      } catch (e) {
        if (e instanceof Error && e.message === "SOURCE_NOT_FOUND") {
          return jsonError("The source month does not exist or is not set up yet.", 404);
        }
        throw e;
      }
    }

    const data = await loadMonthPageData(userId, payload.month);
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid data.", 400);
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    if (error instanceof Error && error.message === "USER_NOT_FOUND") {
      return jsonError("User not found.", 404);
    }
    return jsonError("Unable to create month.", 500);
  }
}
