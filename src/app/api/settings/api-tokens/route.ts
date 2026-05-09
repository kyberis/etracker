import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { generateToken } from "@/lib/api-token";
import { db } from "@/lib/db";
import { getIdpBaseUrl, getIdpBrowserOrigin, shouldSendUsersToUnifiedIdp } from "@/lib/idp-base";
import { withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";

const createSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Ponele un nombre al token (ej. Claude Desktop).")
    .max(60, "El nombre es demasiado largo."),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export async function GET() {
  return withApi(async () => {
    const userId = await requireUserId();
    const tokens = await db.apiToken.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
    return { tokens };
  });
}

export async function POST(request: NextRequest) {
  return withApi(async () => {
    if (shouldSendUsersToUnifiedIdp()) {
      const base = (getIdpBrowserOrigin() || getIdpBaseUrl()).replace(/\/+$/, "");
      const manageUrl = `${base}/account/developer`;
      return NextResponse.json(
        {
          error: "mcp_token_on_idp",
          manageUrl,
          message:
            "MCP tokens are issued on your trefolio account. Open the link below to create or revoke a token (it works for Clara, Will, and trefolio).",
        },
        { status: 410 },
      );
    }

    const userId = await requireUserId();
    const json = await request.json().catch(() => ({}));
    const { name, expiresInDays } = createSchema.parse(json);

    const { plaintext, tokenHash, prefix } = generateToken();
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const created = await db.apiToken.create({
      data: { userId, name, tokenHash, prefix, expiresAt },
      select: {
        id: true,
        name: true,
        prefix: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    // Plaintext is returned ONCE. Front-end is responsible for showing it
    // and warning the user that it won't be displayed again.
    return NextResponse.json({ token: created, plaintext }, { status: 201 });
  });
}
