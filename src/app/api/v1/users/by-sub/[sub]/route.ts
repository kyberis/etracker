import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";

/**
 * Service-to-service endpoint consumed by the trefolio-accounts admin UI.
 *
 * Looks up a Clara user by IdP `sub` (`User.idpSub`) when set; otherwise falls
 * back to `email` query param for legacy rows. Returns a thin admin summary.
 *
 * Auth: `Authorization: Bearer ${IDP_SERVICE_TOKEN}`.
 */
function unauthorized(req: NextRequest): NextResponse | null {
  const auth = req.headers.get("authorization") || "";
  const [scheme, token] = auth.split(" ");
  const expected = process.env.IDP_SERVICE_TOKEN;
  if (!expected || scheme !== "Bearer" || token !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sub: string }> },
) {
  const fail = unauthorized(req);
  if (fail) return fail;

  const { sub } = await params;
  const email = (req.nextUrl.searchParams.get("email") || "").trim().toLowerCase();

  let user =
    (await db.user.findFirst({
      where: { idpSub: sub },
      select: {
        id: true,
        email: true,
        name: true,
        isAdmin: true,
        isActive: true,
        kind: true,
        dailyAgentMessageLimit: true,
        createdAt: true,
        emailVerified: true,
        idpSub: true,
      },
    })) ?? null;

  if (!user && email) {
    user = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        isAdmin: true,
        isActive: true,
        kind: true,
        dailyAgentMessageLimit: true,
        createdAt: true,
        emailVerified: true,
        idpSub: true,
      },
    });
  }

  if (!user) return NextResponse.json({ exists: false, sub }, { status: 200 });

  return NextResponse.json({
    exists: true,
    id: user.id,
    sub,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin,
    isActive: user.isActive,
    kind: user.kind,
    dailyAgentMessageLimit: user.dailyAgentMessageLimit,
    createdAt: user.createdAt.toISOString(),
    emailVerified: Boolean(user.emailVerified),
    idpSub: user.idpSub,
  });
}
