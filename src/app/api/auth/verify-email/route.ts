import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { withApi } from "@/lib/http";
import { log } from "@/lib/log";
import { verifyVerificationToken } from "@/lib/verification-email";

/**
 * GET /api/auth/verify-email?token=...
 *
 * Validates a JWT minted by `createVerificationToken`, marks the matching
 * `User.emailVerified` row, and bounces the browser to `/login?verified=1`.
 *
 * Lives outside the `[...nextauth]` catch-all because NextAuth owns
 * `/api/auth/callback/...` and `/api/auth/signin/...`, but verification is
 * an etracker-specific route and we don't want NextAuth to swallow it.
 */
export async function GET(request: Request) {
  return withApi(async () => {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    const baseUrl = (
      process.env.APP_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL ||
      url.origin
    ).replace(/\/$/, "");

    if (!token) {
      return NextResponse.redirect(`${baseUrl}/login?error=VerificationFailed`);
    }

    const payload = await verifyVerificationToken(token);
    if (!payload) {
      return NextResponse.redirect(`${baseUrl}/login?error=VerificationFailed`);
    }

    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, emailVerified: true },
    });

    if (!user || user.email.toLowerCase() !== payload.email.toLowerCase()) {
      return NextResponse.redirect(`${baseUrl}/login?error=VerificationFailed`);
    }

    if (!user.emailVerified) {
      await db.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      });
      log.info("verify_email_completed", { userId: user.id });
    }

    return NextResponse.redirect(`${baseUrl}/login?verified=1`);
  });
}
