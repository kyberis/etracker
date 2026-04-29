"use client";

import { useEffect, useState } from "react";

import { pick } from "@/lib/i18n";
import { LOCALE_COOKIE, normalizeLocale, pickFromAcceptLanguage, type Locale } from "@/lib/i18n/locale";

/**
 * Client component for the offline page. We can't reach the i18n server
 * helpers here (the page is static, served by the SW for any URL), so we
 * read the locale cookie + navigator.language directly. Defaults to `es`
 * pre-hydration so the SSR'd HTML matches the most common case.
 */
export function OfflineMessage() {
  const [locale, setLocale] = useState<Locale>("es");

  useEffect(() => {
    const cookieMatch = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${LOCALE_COOKIE}=`));
    if (cookieMatch) {
      setLocale(normalizeLocale(decodeURIComponent(cookieMatch.split("=")[1] ?? "")));
      return;
    }
    setLocale(pickFromAcceptLanguage(navigator.language ?? null));
  }, []);

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
      <a
        href="/app"
        className="bg-primary text-primary-foreground inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium shadow-sm transition-colors hover:opacity-90"
      >
        {retry}
      </a>
    </>
  );
}
