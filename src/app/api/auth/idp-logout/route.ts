import { NextResponse } from "next/server";

/**
 * Front-channel logout endpoint loaded as a hidden iframe by the
 * trefolio IdP's `/api/oauth2/end_session` page during single sign-out.
 *
 * Clears every NextAuth-issued cookie this app might have set in the
 * caller's browser. Public on purpose: the cookie itself is the
 * credential being revoked, no further auth check is needed.
 */
export const dynamic = "force-dynamic";

const NEXTAUTH_COOKIES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.csrf-token",
  "__Host-next-auth.csrf-token",
  "next-auth.callback-url",
  "__Secure-next-auth.callback-url",
  "next-auth.pkce.code_verifier",
  "__Secure-next-auth.pkce.code_verifier",
  "next-auth.state",
  "__Secure-next-auth.state",
];

function handle() {
  const res = new NextResponse("<!doctype html><html><body></body></html>", {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-frame-options": "ALLOWALL",
    },
  });
  for (const name of NEXTAUTH_COOKIES) {
    res.cookies.set(name, "", {
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: name.startsWith("__"),
      httpOnly: name.includes("session-token") || name.includes("pkce"),
    });
  }
  return res;
}

export const GET = handle;
export const POST = handle;
