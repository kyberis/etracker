import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { whatsappLinkStartSchema } from "@/lib/validators";
import { LINK_CODE_TTL_MINUTES, generateLinkCode } from "@/lib/whatsapp/link";

export async function GET() {
  return withApi(async () => {
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

    return {
      phone: user.whatsappVerifiedAt ? user.whatsappPhone : null,
      verifiedAt: user.whatsappVerifiedAt,
      pendingCode: pending ? user.whatsappLinkCode : null,
      pendingExpiresAt: pending ? user.whatsappLinkCodeExpires : null,
    };
  });
}

export async function POST(request: Request) {
  return withApi(async () => {
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

    return { code, expiresAt, ttlMinutes: LINK_CODE_TTL_MINUTES };
  });
}

export async function DELETE() {
  return withApi(async () => {
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
    return { ok: true };
  });
}
