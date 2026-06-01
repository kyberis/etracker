"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";

import { pick } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale";

const DEFAULT_SECONDS = 4;

function bridgeCopy(locale: Locale) {
  return {
    login: {
      heading: pick(locale, {
        es: "Inicio de sesion unificado",
        en: "Unified sign-in",
      }),
      body: pick(locale, {
        es: "Te redirigimos a la cuenta compartida de trefolio en user.trefolio.com. El mismo acceso sirve para trefolio, Clara y Will.",
        en: "We are redirecting you to the shared trefolio account at user.trefolio.com. The same login works for trefolio, Clara, and Will.",
      }),
    },
    countdown: (s: number) =>
      pick(locale, {
        es: `Continuando en ${s}s…`,
        en: `Continuing in ${s}s…`,
      }),
    continue: pick(locale, { es: "Continuar ahora", en: "Continue now" }),
    retry: pick(locale, { es: "Intentar de nuevo", en: "Try again" }),
    errorTitle: pick(locale, {
      es: "No pudimos completar el inicio de sesion",
      en: "We could not complete sign-in",
    }),
    idpDisabledTitle: pick(locale, {
      es: "Inicio de sesion no configurado",
      en: "Sign-in not configured",
    }),
    idpDisabledBody: pick(locale, {
      es: "Este entorno no tiene el cliente OAuth del IdP. Configura IDP_BASE_URL, IDP_CLIENT_ID e IDP_CLIENT_SECRET, o usa la app hospedada de Clara.",
      en: "This environment has no IdP OAuth client. Set IDP_BASE_URL, IDP_CLIENT_ID, and IDP_CLIENT_SECRET, or use the hosted Clara app.",
    }),
  };
}

export interface IdpUnifiedBridgeProps {
  callbackUrl?: string;
  uiLocales: string;
  error?: string | null;
  idpDisabled?: boolean;
}

export function IdpUnifiedBridge({
  callbackUrl,
  uiLocales,
  error,
  idpDisabled,
}: IdpUnifiedBridgeProps) {
  const locale: Locale = uiLocales === "en" ? "en" : "es";
  const COPY = bridgeCopy(locale);

  const [secondsLeft, setSecondsLeft] = useState(
    error || idpDisabled ? 0 : DEFAULT_SECONDS,
  );
  const doneRef = useRef(false);

  const startSignIn = useCallback(() => {
    if (doneRef.current || idpDisabled) return;
    doneRef.current = true;
    void signIn(
      "trefolio-id",
      { callbackUrl: callbackUrl || "/app" },
      { app_hint: "clara", ui_locales: uiLocales },
    );
  }, [callbackUrl, uiLocales, idpDisabled]);

  useEffect(() => {
    if (error || idpDisabled) return;

    if (secondsLeft === 0) {
      startSignIn();
      return;
    }

    const id = window.setTimeout(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);

    return () => window.clearTimeout(id);
  }, [secondsLeft, error, idpDisabled, startSignIn]);

  const heading = idpDisabled
    ? COPY.idpDisabledTitle
    : error
      ? COPY.errorTitle
      : COPY.login.heading;
  const body = idpDisabled ? COPY.idpDisabledBody : error ? error : COPY.login.body;

  return (
    <main style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 12,
          border: "1px solid var(--border, #e2e8f0)",
          padding: "2rem",
          background: "var(--card, #fff)",
        }}
      >
        <h1 style={{ textAlign: "center", fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>{heading}</h1>
        <p style={{ marginTop: "1rem", textAlign: "center", fontSize: "0.875rem", color: "#64748b", lineHeight: 1.5 }}>{body}</p>

        {!error && !idpDisabled ? (
          <>
            <p style={{ marginTop: "1.5rem", textAlign: "center", fontSize: "0.875rem", fontWeight: 500 }} role="status" aria-live="polite">
              {COPY.countdown(secondsLeft)}
            </p>
            <button
              type="button"
              onClick={startSignIn}
              style={{
                marginTop: "1.5rem",
                width: "100%",
                padding: "0.75rem 1rem",
                borderRadius: 8,
                border: "none",
                background: "#059669",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {COPY.continue}
            </button>
          </>
        ) : !idpDisabled ? (
          <button
            type="button"
            onClick={startSignIn}
            style={{
              marginTop: "1.5rem",
              width: "100%",
              padding: "0.75rem 1rem",
              borderRadius: 8,
              border: "none",
              background: "#059669",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {COPY.retry}
          </button>
        ) : null}
      </div>
    </main>
  );
}
