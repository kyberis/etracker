import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { parseMonthKey } from "@/lib/months";
import { requireUserId } from "@/lib/session";
import { paymentToggleSchema } from "@/lib/validators";

async function ensureExpenseOwnership(expenseId: string, userId: string) {
  const expense = await db.expense.findFirst({
    where: { id: expenseId, userId },
    select: { id: true },
  });

  if (!expense) {
    throw new Error("NOT_FOUND");
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    await ensureExpenseOwnership(id, userId);

    const body = await request.json();
    const payload = paymentToggleSchema.parse(body);
    const month = parseMonthKey(payload.month);

    const payment = await db.payment.upsert({
      where: { expenseId_month: { expenseId: id, month } },
      create: { expenseId: id, month },
      update: { paidAt: new Date() },
    });

    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid data.", 400);
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return jsonError("Expense not found.", 404);
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    return jsonError("Unable to mark as paid.", 500);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    await ensureExpenseOwnership(id, userId);

    const body = await request.json();
    const payload = paymentToggleSchema.parse(body);
    const month = parseMonthKey(payload.month);

    await db.payment.deleteMany({
      where: {
        expenseId: id,
        month,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid data.", 400);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return jsonError("Payment not found.", 404);
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return jsonError("Expense not found.", 404);
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    return jsonError("Unable to unmark payment.", 500);
  }
}
