import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { mergePendingTemplateLinesIntoMonth } from "@/lib/month-bucket";
import { jsonError } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { monthParamSchema } from "@/lib/validators";

export async function POST(
  _request: Request,
  context: { params: Promise<{ month: string }> },
) {
  try {
    const userId = await requireUserId();
    const { month: monthParam } = await context.params;
    const { month: monthKey } = monthParamSchema.parse({ month: monthParam });
    const result = await mergePendingTemplateLinesIntoMonth(userId, monthKey);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "NO_RECORD") {
      return jsonError("El mes no está configurado aún.", 404);
    }
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid month.", 400);
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    if (error instanceof Error && error.message.includes("Invalid month format")) {
      return jsonError("Month must be in yyyy-MM format.", 400);
    }
    return jsonError("No se pudieron agregar los gastos.", 500);
  }
}
