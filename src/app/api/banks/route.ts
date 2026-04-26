import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { bankSchema } from "@/lib/validators";

export async function GET() {
  try {
    const userId = await requireUserId();
    const banks = await db.bank.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ banks });
  } catch {
    return jsonError("Unauthorized.", 401);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const payload = bankSchema.parse(body);
    const color = payload.color?.startsWith("#")
      ? payload.color
      : payload.color
        ? `#${payload.color}`
        : null;

    const bank = await db.bank.create({
      data: {
        userId,
        name: payload.name.trim(),
        color,
      },
    });

    return NextResponse.json({ bank }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid data.", 400);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonError("Bank name already exists.", 409);
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    return jsonError("Unable to create bank.", 500);
  }
}
