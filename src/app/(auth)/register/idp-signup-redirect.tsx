"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";

interface Props {
  callbackUrl?: string;
}

/**
 * When legacy email registration is off and the IdP is enabled, `/register`
 * starts OIDC with `screen_hint=signup` so user.trefolio.com opens in
 * create-account mode.
 */
export default function IdpSignupRedirect({ callbackUrl }: Props) {
  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get("error");
    if (err) return;
    void signIn(
      "trefolio-id",
      { callbackUrl: callbackUrl || "/onboarding" },
      { app_hint: "clara", screen_hint: "signup" },
    );
  }, [callbackUrl]);

  return (
    <div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>
      Redirecting to create your account…
    </div>
  );
}
