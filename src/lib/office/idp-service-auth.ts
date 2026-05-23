import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function requireIdpServiceToken(req: NextRequest): NextResponse | null {
  const auth = req.headers.get("authorization") || "";
  const [scheme, token] = auth.split(" ");
  const expected = process.env.IDP_SERVICE_TOKEN?.trim();
  if (!expected || scheme !== "Bearer" || token !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export interface OfficeUserLookup {
  sub?: string;
  email?: string;
  trefolioUserId?: string;
}

export function readOfficeUserLookup(req: NextRequest, body?: OfficeUserLookup): OfficeUserLookup {
  const url = req.nextUrl;
  return {
    sub: (body?.sub || url.searchParams.get("sub") || "").trim(),
    email: (body?.email || url.searchParams.get("email") || "").trim().toLowerCase(),
    trefolioUserId: (
      body?.trefolioUserId ||
      url.searchParams.get("trefolioUserId") ||
      req.headers.get("x-trefolio-user-id") ||
      ""
    ).trim(),
  };
}
