"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";

interface Props {
  callbackUrl?: string;
  /** OIDC `ui_locales` tag for user.trefolio.com (e.g. `es`, `en`). */
  uiLocales: string;
}

/**
 * When legacy email registration is off and the IdP is enabled, `/register`
 * starts OIDC with `screen_hint=signup` so user.trefolio.com opens in
 * create-account mode.
 */
export default function IdpSignupRedirect({ callbackUrl, uiLocales }: Props) {
  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get("error");
    if (err) return;
    void signIn(
      "trefolio-id",
      { callbackUrl: callbackUrl || "/onboarding" },
      { app_hint: "clara", screen_hint: "signup", ui_locales: uiLocales },
    );
  }, [callbackUrl, uiLocales]);

  return (
    <div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>
      Redirecting to create your account…
    </div>
  );
}
