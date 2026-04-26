import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

import { jsonError } from "@/lib/http";
import { loadMonthPageData } from "@/lib/month-page-data";
import { parseMonthKey, toMonthStart } from "@/lib/months";
import { requireUserId } from "@/lib/session";
import { monthlyIncomeSchema, monthParamSchema } from "@/lib/validators";

import { db } from "@/lib/db";

export async function GET(_request: Request, context: { params: Promise<{ month: string }> }) {
  try {
    const userId = await requireUserId();
    const { month: monthParam } = await context.params;
    const { month: monthKey } = monthParamSchema.parse({ month: monthParam });
    const data = await loadMonthPageData(userId, monthKey);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid data.", 400);
    }
    if (error instanceof Error && error.message.includes("Invalid month format")) {
      return jsonError("Month must be in yyyy-MM format.", 400);
    }
    return jsonError("Unable to load month data.", 500);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ month: string }> }) {
  try {
    const userId = await requireUserId();
    const { month: monthParam } = await context.params;
    const { month: monthKey } = monthParamSchema.parse({ month: monthParam });
    const month = toMonthStart(parseMonthKey(monthKey));

    const body = await request.json();
    const payload = monthlyIncomeSchema.parse(body);

    const existing = await db.monthRecord.findFirst({
      where: { userId, month },
    });
    if (!existing) {
      return jsonError("Month not set up. Create the month first.", 404);
    }

    const record = await db.monthRecord.update({
      where: { id: existing.id },
      data: {
        income: new Prisma.Decimal(payload.amount.toFixed(2)),
      },
    });

    return NextResponse.json({
      month: monthKey,
      income: Number(record.income),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid data.", 400);
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    if (error instanceof Error && error.message.includes("Invalid month format")) {
      return jsonError("Month must be in yyyy-MM format.", 400);
    }
    return jsonError("Unable to update month income.", 500);
  }
}
