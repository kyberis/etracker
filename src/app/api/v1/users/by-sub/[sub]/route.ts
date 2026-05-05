import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";

/**
 * Service-to-service endpoint consumed by the trefolio-accounts admin UI.
 *
 * Clara identifies users by `email` (no `idpSub` column), so callers pass
 * the IdP `sub` in the path for traceability and the canonical lookup key
 * (`email`) as a query parameter. Returns whether a local Clara user exists
 * and a thin admin summary if so.
 *
 * Auth: `Authorization: Bearer ${IDP_SERVICE_TOKEN}`. Same shared secret
 * used by the rest of the IdP↔Clara service plane.
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
  if (!email) {
    return NextResponse.json({ exists: false, sub }, { status: 200 });
  }

  const user = await db.user.findUnique({
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
    },
  });
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
  });
}
