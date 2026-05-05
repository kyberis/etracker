import { NextRequest, NextResponse } from "next/server";
import { getIdpBaseUrl } from "@/lib/idp-base";

/**
 * User-initiated sign-out that triggers single sign-out across all
 * trefolio products (trefolio, Clara, Will).
 *
 * 1. Clears Clara's NextAuth cookies locally so this product is logged
 *    out immediately, even if the IdP is unreachable.
 * 2. Redirects the browser to the IdP's `/api/oauth2/end_session`, which
 *    clears the IdP session cookie and front-channel-fires every
 *    registered client's `/api/auth/idp-logout` so the user ends up
 *    signed out everywhere.
 *
 * Triggered by the "Sign out" button in the app header. Safe to call
 * via GET so a plain `<a href>` works as a no-JS fallback, though the
 * UI normally POSTs to it.
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

function clearAuthCookies(res: NextResponse) {
  for (const name of NEXTAUTH_COOKIES) {
    res.cookies.set(name, "", {
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: name.startsWith("__"),
      httpOnly: name.includes("session-token") || name.includes("pkce"),
    });
  }
}

async function handle(req: NextRequest) {
  const url = new URL(req.url);
  const back = url.searchParams.get("back") || "/";
  // Resolve `back` against this app's origin to prevent open-redirect.
  const safeBack = (() => {
    try {
      return new URL(back, url.origin).origin === url.origin
        ? new URL(back, url.origin).toString()
        : url.origin + "/";
    } catch {
      return url.origin + "/";
    }
  })();

  const idpBase = getIdpBaseUrl();
  let target = safeBack;
  if (idpBase) {
    const u = new URL(`${idpBase}/api/oauth2/end_session`);
    u.searchParams.set("client_id", process.env.IDP_CLIENT_ID || "clara");
    u.searchParams.set("post_logout_redirect_uri", safeBack);
    target = u.toString();
  }

  const res = NextResponse.redirect(target, 303);
  clearAuthCookies(res);
  return res;
}

export const GET = handle;
export const POST = handle;
