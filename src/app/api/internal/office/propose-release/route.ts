import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { readOfficeUserLookup, requireIdpServiceToken } from "@/lib/office/idp-service-auth";
import { proposeOfficeSavingsRelease } from "@/lib/office/propose-release";
import { resolveOfficeUser } from "@/lib/office/resolve-office-user";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    sub: z.string().optional(),
    email: z.string().optional(),
    trefolioUserId: z.string().optional(),
    amountEur: z.number().positive().max(1_000_000),
  })
  .strict();

/**
 * Warren Agent Office — record savings release for investing (MANUAL_WITHDRAWAL).
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

  const lookup = readOfficeUserLookup(req, body);
  const user = await resolveOfficeUser(lookup);
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const result = await proposeOfficeSavingsRelease(user.id, body.amountEur);
  if (!result.ok) {
    const status = result.error === "insufficient_savings" ? 400 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, message: result.message, balance: result.balance });
}
