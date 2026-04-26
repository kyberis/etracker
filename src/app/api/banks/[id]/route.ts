import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { bankSchema } from "@/lib/validators";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    const body = await request.json();
    const payload = bankSchema.parse(body);
    const color = payload.color?.startsWith("#")
      ? payload.color
      : payload.color
        ? `#${payload.color}`
        : null;
    const existing = await db.bank.findFirst({ where: { id, userId } });
    if (!existing) {
      return jsonError("Bank not found.", 404);
    }

    const bank = await db.bank.update({
      where: { id },
      data: {
        name: payload.name.trim(),
        color,
      },
    });

    return NextResponse.json({ bank });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid data.", 400);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return jsonError("Bank not found.", 404);
      }
      if (error.code === "P2002") {
        return jsonError("Bank name already exists.", 409);
      }
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    return jsonError("Unable to update bank.", 500);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;

    const expenseCount = await db.expense.count({
      where: { bankId: id, userId },
    });

    if (expenseCount > 0) {
      return jsonError(
        "Cannot delete a bank with assigned expenses. Reassign or delete expenses first.",
        409,
      );
    }

    await db.bank.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return jsonError("Bank not found.", 404);
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    return jsonError("Unable to delete bank.", 500);
  }
}
