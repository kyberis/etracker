import { Prisma } from "@prisma/client";

import { getBanksCached, invalidateBanksCache } from "@/lib/cache/banks";
import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { bankSchema } from "@/lib/validators";

export async function GET() {
  return withApi(async () => {
    const userId = await requireUserId();
    const banks = await getBanksCached(userId);
    return { banks };
  });
}

export async function POST(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const body = await request.json();
    const payload = bankSchema.parse(body);
    const color = payload.color?.startsWith("#")
      ? payload.color
      : payload.color
        ? `#${payload.color}`
        : null;

    try {
      const bank = await db.bank.create({
        data: {
          userId,
          name: payload.name.trim(),
          color,
        },
      });
      await invalidateBanksCache(userId);
      return new Response(JSON.stringify({ bank }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
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
