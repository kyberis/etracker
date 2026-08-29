import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureOfficeUser } from "@/lib/office/ensure-office-user";
import { readOfficeUserLookup, requireIdpServiceToken } from "@/lib/office/idp-service-auth";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    sub: z.string().max(200).optional().default(""),
    email: z.string().max(320).optional().default(""),
    name: z.string().max(200).optional().nullable(),
    trefolioUserId: z.string().max(200).optional().default(""),
    dailyAgentMessageLimit: z.number().int().positive().max(10_000).optional(),
  })
  .strict();

/**
 * Trefolio onboarding / home CTA — provision a Clara local User for the
 * shared IdP identity without a browser SSO round-trip.
 * Auth: Bearer IDP_SERVICE_TOKEN.
 * Does not accept Clara terms or complete Clara onboarding.
 */
export async function POST(req: NextRequest) {
  const fail = requireIdpServiceToken(req);
  if (fail) return fail;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const lookup = readOfficeUserLookup(req, {
    sub: body.sub,
    email: body.email,
    trefolioUserId: body.trefolioUserId,
  });

  const result = await ensureOfficeUser({
    sub: lookup.sub || "",
    email: lookup.email || "",
    name: body.name,
    dailyAgentMessageLimit: body.dailyAgentMessageLimit,
  });

  if (!result.ok) {
    const status =
      result.error === "missing_sub" || result.error === "missing_email"
        ? 400
        : result.error === "inactive_user"
          ? 403
          : 409;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    created: result.created,
    id: result.user.id,
    idpSub: result.user.idpSub,
    email: result.user.email,
  });
}
