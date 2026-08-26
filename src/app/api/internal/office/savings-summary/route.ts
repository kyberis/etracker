import { NextRequest, NextResponse } from "next/server";

import { buildClaraOfficeCashflowSnapshot } from "@/lib/office/savings-summary";
import { readOfficeUserLookup, requireIdpServiceToken } from "@/lib/office/idp-service-auth";
import { resolveOfficeUser } from "@/lib/office/resolve-office-user";

export const dynamic = "force-dynamic";

/**
 * Warren Agent Office — read savings surplus for cross-app missions.
 * Auth: Bearer IDP_SERVICE_TOKEN. Identity: sub + email + trefolioUserId.
 */
export async function GET(req: NextRequest) {
  const fail = requireIdpServiceToken(req);
  if (fail) return fail;

  const lookup = readOfficeUserLookup(req);
  const user = await resolveOfficeUser(lookup);
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  return NextResponse.json(await buildClaraOfficeCashflowSnapshot(user));
}
