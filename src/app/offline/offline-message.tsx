"use client";

import { useSyncExternalStore } from "react";

import { pick } from "@/lib/i18n";
import { LOCALE_COOKIE, normalizeLocale, pickFromAcceptLanguage, type Locale } from "@/lib/i18n/locale";

/**
 * Client component for the offline page. We can't reach the i18n server
 * helpers here (the page is static, served by the SW for any URL), so we
 * read the locale cookie + navigator.language directly. Defaults to `es`
 * pre-hydration so the SSR'd HTML matches the most common case.
 *
 * `useSyncExternalStore` keeps this hydration-safe (server snapshot is
 * always `"es"`; client snapshot reads cookie/`navigator`) and avoids the
 * React 19 `react-hooks/set-state-in-effect` lint rule that fires on
 * `setState` inside `useEffect`.
 */

const noopSubscribe = () => () => undefined;

function readLocaleFromBrowser(): Locale {
  if (typeof document === "undefined") return "es";
  const cookieMatch = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${LOCALE_COOKIE}=`));
  if (cookieMatch) {
    return normalizeLocale(decodeURIComponent(cookieMatch.split("=")[1] ?? ""));
  }
  return pickFromAcceptLanguage(
    typeof navigator !== "undefined" ? navigator.language ?? null : null,
  );
}

export function OfflineMessage() {
  const locale = useSyncExternalStore<Locale>(
    noopSubscribe,
    readLocaleFromBrowser,
    () => "es",
  );

  const heading = pick(locale, { es: "Estás sin conexión", en: "You're offline" });
  const body = pick(locale, {
    es: "No pudimos cargar esta vista. Revisá tu conexión y volvé a intentar — Clara va a retomar donde lo dejaste.",
    en: "We couldn't load this view. Check your connection and try again — Clara will pick up where you left off.",
  });
  const retry = pick(locale, { es: "Reintentar", en: "Retry" });

  return (
    <>
      <div className="flex max-w-sm flex-col gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {heading}
        </h1>
        <p className="text-muted-foreground text-sm">{body}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          // Hard reload so the service worker re-fetches /app from the
          // network now that the user is hopefully back online — a SPA
          // <Link> would replay the cached offline document.
          if (typeof window !== "undefined") window.location.assign("/app");
        }}
        className="bg-primary text-primary-foreground inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium shadow-sm transition-colors hover:opacity-90"
      >
        {retry}
      </button>
    </>
  );
}
