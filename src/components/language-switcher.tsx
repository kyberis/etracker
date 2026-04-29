"use client";

import { Globe } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useLocale, useSetLocale } from "@/lib/i18n/client";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";

type Props = {
  /**
   * `app`: small inline pill used in the authenticated header dialog.
   * `marketing`: header pill that swaps the `/<lang>/...` URL prefix in
   * place so SEO sees the right canonical immediately.
   */
  variant: "app" | "marketing";
  /** Marketing only: the current `/<lang>` segment, e.g. `/es`. */
  currentPath?: string;
  /**
   * Marketing only: whether the request is from a logged-in user. When
   * true we also persist the choice to the DB; otherwise we just rewrite
   * the URL and let the proxy seed the cookie on the next request.
   */
  authenticated?: boolean;
  className?: string;
};

export function LanguageSwitcher({
  variant,
  currentPath,
  authenticated = true,
  className,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function pick(target: Locale) {
    if (target === locale) return;
    setBusy(true);
    try {
      // Server-side persistence (only when we have a session). For
      // anonymous marketing visitors the URL prefix change is enough; the
      // proxy seeds the cookie on the next request.
      if (authenticated) {
        const ok = await setLocale(target);
        if (!ok && variant === "app") {
          return;
        }
      }
      if (variant === "marketing" && currentPath) {
        const next = pathname.replace(/^\/[^/]+/, `/${target}`) || `/${target}`;
        startTransition(() => {
          router.replace(next);
          router.refresh();
        });
      } else {
        startTransition(() => router.refresh());
      }
    } finally {
      setBusy(false);
    }
  }

  if (variant === "app") {
    return (
      <div
        className={cn(
          "bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 text-xs font-semibold",
          className,
        )}
        role="group"
        aria-label="Idioma / Language"
      >
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => pick(l)}
            disabled={busy || pending}
            aria-pressed={l === locale}
            className={cn(
              "rounded-full px-2.5 py-1 uppercase tracking-wide transition-colors",
              l === locale
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {l}
          </button>
        ))}
      </div>
    );
  }

  // Marketing: a compact globe button that toggles to the OTHER locale.
  const other = LOCALES.find((l) => l !== locale) ?? "en";
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => pick(other)}
      disabled={busy || pending}
      className={cn("text-muted-foreground hover:text-foreground gap-1.5", className)}
      aria-label={`Switch to ${LOCALE_LABELS[other]}`}
      title={`${LOCALE_LABELS[other]}`}
    >
      <Globe className="size-4" />
      <span className="text-xs font-semibold uppercase">{other}</span>
    </Button>
  );
}
