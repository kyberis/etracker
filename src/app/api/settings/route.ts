import bcrypt from "bcrypt";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { settingsSchema } from "@/lib/validators";

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, expenseImportInstructions: true },
    });
    if (!user) {
      return jsonError("User not found.", 404);
    }

    return NextResponse.json({
      user: {
        email: user.email,
        expenseImportInstructions: user.expenseImportInstructions,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    return jsonError("Unable to load settings.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const payload = settingsSchema.parse(body);

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return jsonError("User not found.", 404);
    }

    if (payload.newPassword) {
      if (!payload.currentPassword) {
        return jsonError("Current password is required.", 400);
      }

      const validCurrent = await bcrypt.compare(payload.currentPassword, user.passwordHash);
      if (!validCurrent) {
        return jsonError("Current password is incorrect.", 401);
      }
    }

    await db.user.update({
      where: { id: userId },
      data: {
        ...(payload.newPassword
          ? { passwordHash: await bcrypt.hash(payload.newPassword, 12) }
          : {}),
        ...(payload.expenseImportInstructions !== undefined
          ? { expenseImportInstructions: payload.expenseImportInstructions }
          : {}),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid data.", 400);
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    return jsonError("Unable to update settings.", 500);
  }
}
