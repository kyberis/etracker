import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { registerSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    if (!process.env.DATABASE_URL) {
      return jsonError(
        "Database is not configured. Set DATABASE_URL in your .env file and restart the app.",
        500,
      );
    }

    const body = await request.json();
    const payload = registerSchema.parse(body);

    const existing = await db.user.findUnique({ where: { email: payload.email } });
    if (existing) {
      return jsonError("Email already in use.", 409);
    }

    const passwordHash = await bcrypt.hash(payload.password, 12);

    await db.user.create({
      data: {
        email: payload.email,
        passwordHash,
      },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid data.", 400);
    }
    if (
      error instanceof Prisma.PrismaClientInitializationError ||
      error instanceof Prisma.PrismaClientKnownRequestError
    ) {
      return jsonError(
        "Cannot connect to the database. Verify DATABASE_URL and run Prisma migrations.",
        500,
      );
    }
    return jsonError("Unable to create account.", 500);
  }
}
