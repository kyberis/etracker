import { Prisma } from "@prisma/client";

import { invalidateBanksCache } from "@/lib/cache/banks";
import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { bankSchema } from "@/lib/validators";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
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

    try {
      const bank = await db.bank.update({
        where: { id },
        data: { name: payload.name.trim(), color },
      });
      await invalidateBanksCache(userId);
      return { bank };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return jsonError("Bank name already exists.", 409);
      }
      throw error;
    }
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return withApi(async () => {
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

    const existing = await db.bank.findFirst({ where: { id, userId } });
    if (!existing) {
      return jsonError("Bank not found.", 404);
    }

    await db.bank.delete({ where: { id } });
    await invalidateBanksCache(userId);
    return { ok: true };
  });
}
