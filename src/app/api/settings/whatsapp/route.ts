import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { whatsappLinkStartSchema } from "@/lib/validators";
import { LINK_CODE_TTL_MINUTES, generateLinkCode } from "@/lib/whatsapp/link";

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        whatsappPhone: true,
        whatsappVerifiedAt: true,
        whatsappLinkCode: true,
        whatsappLinkCodeExpires: true,
      },
    });
    if (!user) return jsonError("User not found.", 404);

    const pending =
      user.whatsappLinkCode &&
      user.whatsappLinkCodeExpires &&
      user.whatsappLinkCodeExpires.getTime() > Date.now();

    return NextResponse.json({
      phone: user.whatsappVerifiedAt ? user.whatsappPhone : null,
      verifiedAt: user.whatsappVerifiedAt,
      pendingCode: pending ? user.whatsappLinkCode : null,
      pendingExpiresAt: pending ? user.whatsappLinkCodeExpires : null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    return jsonError("Unable to load WhatsApp link.", 500);
  }
}

/** Generate (or rotate) a 6-digit code the user can send to the WhatsApp bot. */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    whatsappLinkStartSchema.parse(body);

    const code = generateLinkCode();
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60 * 1000);

    await db.user.update({
      where: { id: userId },
      data: {
        whatsappLinkCode: code,
        whatsappLinkCodeExpires: expiresAt,
      },
    });

    return NextResponse.json({
      code,
      expiresAt,
      ttlMinutes: LINK_CODE_TTL_MINUTES,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid data.", 400);
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    return jsonError("Unable to start WhatsApp link.", 500);
  }
}

export async function DELETE() {
  try {
    const userId = await requireUserId();
    await db.user.update({
      where: { id: userId },
      data: {
        whatsappPhone: null,
        whatsappVerifiedAt: null,
        whatsappLinkCode: null,
        whatsappLinkCodeExpires: null,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    return jsonError("Unable to unlink WhatsApp.", 500);
  }
}
