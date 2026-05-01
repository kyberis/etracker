import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getAuthSession } from "@/lib/auth";

/**
 * Lists the passkeys belonging to the signed-in user. Powers the
 * "Mis passkeys" card in /settings.
 */
export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const passkeys = await db.passkey.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      lastUsedAt: true,
      deviceType: true,
      backedUp: true,
    },
  });

  return NextResponse.json({
    passkeys: passkeys.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt.toISOString(),
      lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
      deviceType: p.deviceType,
      backedUp: p.backedUp,
    })),
  });
}
