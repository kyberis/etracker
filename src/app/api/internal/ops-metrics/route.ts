import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { withApi } from "@/lib/http";

export const dynamic = "force-dynamic";

function unauthorized(req: NextRequest): Response | null {
  const auth = req.headers.get("authorization") || "";
  const [scheme, token] = auth.split(" ");
  const expected = process.env.IDP_SERVICE_TOKEN;
  if (!expected || scheme !== "Bearer" || token !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

/**
 * IdP ops digest — aggregate user counts only (no PII).
 */
export async function GET(req: NextRequest) {
  const fail = unauthorized(req);
  if (fail) return fail;

  return withApi(async () => {
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const [usersTotal, signups7d, idpLinked, guests] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { createdAt: { gte: weekAgo } } }),
      db.user.count({ where: { idpSub: { not: null } } }),
      db.user.count({ where: { kind: "GUEST" } }),
    ]);

    return {
      product: "clara" as const,
      generatedAt: new Date().toISOString(),
      totals: {
        users_total: usersTotal,
        signups_7d: signups7d,
        users_idp_linked: idpLinked,
        users_guest: guests,
      },
    };
  });
}
