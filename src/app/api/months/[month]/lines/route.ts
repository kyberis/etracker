import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { isCurrentMonthKey, parseMonthKey, toMonthStart } from "@/lib/months";
import { requireUserId } from "@/lib/session";
import { monthExpenseLineCreateSchema, monthParamSchema } from "@/lib/validators";

export async function POST(request: Request, context: { params: Promise<{ month: string }> }) {
  try {
    const userId = await requireUserId();
    const { month: monthParam } = await context.params;
    const { month: monthKey } = monthParamSchema.parse({ month: monthParam });

    if (!isCurrentMonthKey(monthKey)) {
      return jsonError("Solo se pueden agregar gastos al mes en curso.", 403);
    }

    const month = toMonthStart(parseMonthKey(monthKey));
    const body = await request.json();
    const payload = monthExpenseLineCreateSchema.parse(body);

    const monthRecord = await db.monthRecord.findFirst({
      where: { userId, month },
    });
    if (!monthRecord) {
      return jsonError("Configurá el mes primero.", 404);
    }

    const bank = await db.bank.findFirst({ where: { id: payload.bankId, userId } });
    if (!bank) {
      return jsonError("El banco no existe.", 404);
    }

    const line = await db.monthExpenseLine.create({
      data: {
        monthRecordId: monthRecord.id,
        templateId: null,
        bankId: payload.bankId,
        name: payload.name.trim(),
        amount: new Prisma.Decimal(payload.amount.toFixed(2)),
        category: payload.category,
        paid: false,
      },
      include: { bank: { select: { name: true } } },
    });

    return NextResponse.json(
      {
        line: {
          id: line.id,
          name: line.name,
          amount: line.amount.toString(),
          bankId: line.bankId,
          bankName: line.bank.name,
          paid: line.paid,
          category: line.category,
        },
      },
      { status: 201 },
    );
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
    return jsonError("No se pudo agregar el gasto.", 500);
  }
}
