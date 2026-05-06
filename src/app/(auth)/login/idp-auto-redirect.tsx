"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";

interface Props {
  callbackUrl?: string;
}

/**
 * Bridges the unified-login flow: when the IdP is enabled and legacy auth
 * is off, /login renders this component, which posts to NextAuth's CSRF +
 * provider endpoints to start the OIDC redirect to user.trefolio.com.
 *
 * Server-side `redirect("/api/auth/signin/trefolio-id")` would not work
 * because NextAuth v4 only accepts POST (with CSRF) for OAuth providers.
 *
 * Default `callbackUrl` is `/app` so a successful login lands in Clara, not
 * the marketing homepage (`/`).
 */
export default function IdpAutoRedirect({ callbackUrl }: Props) {
  useEffect(() => {
    // Defense in depth: if `?error=` is present (e.g. OAuth failed), never
    // auto-retry signIn — avoids a redirect loop when the server page mis-read
    // searchParams or the client hydrates before the URL updates.
    const err = new URLSearchParams(window.location.search).get("error");
    if (err) return;
    void signIn("trefolio-id", { callbackUrl: callbackUrl || "/app" });
  }, [callbackUrl]);

  return (
    <div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>
      Redirecting to trefolio sign-in…
    </div>
  );
}
