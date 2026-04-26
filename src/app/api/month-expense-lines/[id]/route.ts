import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { monthExpenseLineUpdateSchema } from "@/lib/validators";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    const body = await request.json();
    const payload = monthExpenseLineUpdateSchema.parse(body);

    const line = await db.monthExpenseLine.findFirst({
      where: { id, monthRecord: { userId } },
    });
    if (!line) {
      return jsonError("Line not found.", 404);
    }

    const data: {
      paid?: boolean;
      name?: string;
      amount?: Prisma.Decimal;
    } = {};
    if (payload.paid !== undefined) {
      data.paid = payload.paid;
    }
    if (payload.name !== undefined) {
      data.name = payload.name;
    }
    if (payload.amount !== undefined) {
      data.amount = new Prisma.Decimal(payload.amount.toFixed(2));
    }

    if (Object.keys(data).length === 0) {
      return jsonError("Nothing to update.", 400);
    }

    const updated = await db.monthExpenseLine.update({
      where: { id },
      data,
    });

    return NextResponse.json({ line: updated });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid data.", 400);
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    return jsonError("Unable to update line.", 500);
  }
}
