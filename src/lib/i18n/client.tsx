"use client";

import { createContext, useCallback, useContext, useMemo } from "react";

import { getDict, pick, type Dict, type Locale } from "./index";

/** Re-export the pure inline picker so client components can `import { pick } from "@/lib/i18n/client"`. */
export { pick };

type LocaleContextValue = {
  locale: Locale;
  t: Dict;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Wraps client components so they can read the active locale and the
 * resolved dictionary via `useLocale()` / `useT()` without prop drilling.
 *
 * Plays well with Server Components: the server resolves the locale once
 * (via `getLocale()`), then passes it down as a prop to this provider.
 * Client components down-tree read it synchronously.
 */
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = useMemo<LocaleContextValue>(
    () => ({ locale, t: getDict(locale) }),
    [locale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Soft fallback for components rendered outside the provider (tests,
    // legacy pages). We don't throw because plenty of trees would bail on
    // first render during incremental migration.
    return "es";
  }
  return ctx.locale;
}

export function useT(): Dict {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    return getDict("es");
  }
  return ctx.t;
}

/**
 * Inline translator. Returns `options[currentLocale]`, useful when a string
 * is component-local and dictionary churn isn't worth it.
 */
export function useTx() {
  const locale = useLocale();
  return <T,>(options: Record<Locale, T>): T => options[locale];
}

/**
 * Helper to update the active locale via the API + a router refresh. The
 * caller is responsible for the actual navigation/refresh.
 */
export function useSetLocale() {
  return useCallback(async (locale: Locale): Promise<boolean> => {
    const response = await fetch("/api/settings/locale", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
    });
    return response.ok;
  }, []);
}
