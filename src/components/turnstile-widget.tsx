"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact" | "flexible";
        },
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function isLocalhostOrigin(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
}

interface TurnstileWidgetProps {
  onToken: (token: string) => void;
  onError?: () => void;
}

/**
 * Cloudflare Turnstile invisible-style captcha. The widget is intentionally
 * a no-op when:
 * - The page is loaded from localhost (so `next dev` and local prod builds
 *   without Cloudflare keys still work).
 * - `NEXT_PUBLIC_TURNSTILE_DISABLED=1` (operator opt-out).
 * - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is not set (self-host without
 *   Cloudflare).
 *
 * The server-side check in `src/lib/turnstile.ts` mirrors these skips so a
 * missing widget never blocks signup/login in those environments.
 */
const noopSubscribe = () => () => undefined;

export function TurnstileWidget({ onToken, onError }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const disabled = process.env.NEXT_PUBLIC_TURNSTILE_DISABLED === "1";
  // Hydration-safe localhost detection. The server snapshot is always
  // `false` (no `window`); the client snapshot reads `location.hostname`,
  // and React resolves the difference during commit without React 19's
  // setState-in-effect lint hitting us.
  const localhost = useSyncExternalStore(
    noopSubscribe,
    () => isLocalhostOrigin(),
    () => false,
  );

  const renderWidget = useCallback(() => {
    if (!siteKey || !containerRef.current || !window.turnstile) return;
    if (widgetIdRef.current) return;
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: onToken,
      "error-callback": onError,
      "expired-callback": onError,
      theme: "auto",
      size: "flexible",
    });
  }, [siteKey, onToken, onError]);

  useEffect(() => {
    if (disabled || localhost || !siteKey) return;
    if (window.turnstile) {
      renderWidget();
      return;
    }
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = renderWidget;
      document.head.appendChild(script);
      return;
    }
    const check = setInterval(() => {
      if (window.turnstile) {
        clearInterval(check);
        renderWidget();
      }
    }, 100);
    return () => clearInterval(check);
  }, [siteKey, renderWidget, disabled, localhost]);

  useEffect(() => {
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, []);

  if (disabled || localhost || !siteKey) return null;
  return <div ref={containerRef} className="flex justify-center" />;
}
