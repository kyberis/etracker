import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { parseMonthKey } from "@/lib/months";
import { requireUserId } from "@/lib/session";
import { expenseSchema } from "@/lib/validators";

export async function GET() {
  try {
    const userId = await requireUserId();

    const expenses = await db.expense.findMany({
      where: { userId },
      include: { bank: true },
      orderBy: [{ name: "asc" }],
    });

    return NextResponse.json({ expenses });
  } catch {
    return jsonError("Unauthorized.", 401);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const payload = expenseSchema.parse(body);

    const bank = await db.bank.findFirst({ where: { id: payload.bankId, userId } });
    if (!bank) {
      return jsonError("Selected bank does not exist.", 404);
    }

    const expense = await db.expense.create({
      data: {
        userId,
        bankId: payload.bankId,
        name: payload.name.trim(),
        amount: new Prisma.Decimal(payload.amount.toFixed(2)),
        isRecurring: payload.isRecurring,
        startMonth: parseMonthKey(payload.startMonth),
        endMonth: payload.endMonth ? parseMonthKey(payload.endMonth) : null,
      },
      include: { bank: true },
    });

    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid data.", 400);
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    return jsonError("Unable to create expense.", 500);
  }
}
