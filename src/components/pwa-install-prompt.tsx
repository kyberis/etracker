"use client";

import { Download, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useT, useTx } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "ada_pwa_install_dismissed_at";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const t = Number.parseInt(raw, 10);
    if (Number.isNaN(t)) return false;
    return Date.now() - t < DISMISS_MS;
  } catch {
    return false;
  }
}

function isIosTouchSafari(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!iOS) return false;
  // Avoid showing on in-app browsers that often break Add to Home Screen flows
  const noStandalone =
    /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA|Line\/|FBAN|FBAV|Instagram|Snapchat|Twitter/i.test(ua) ===
    false;
  return noStandalone;
}

function shouldShowIosHint(): boolean {
  if (typeof window === "undefined") return false;
  if (window.innerWidth >= 768) return false;
  return isIosTouchSafari();
}

export function PwaInstallPrompt() {
  const t = useT();
  const tx = useTx();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;
    if (isStandalone()) return;
    if (isDismissed()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setIosHint(false);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS: no beforeinstallprompt; show a one-line hint on small screens.
    // Defer state updates so we don't synchronously setState inside the effect body (eslint).
    const raf = window.requestAnimationFrame(() => {
      if (shouldShowIosHint()) {
        setIosHint(true);
        setVisible(true);
      }
    });

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  async function onInstall() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className={cn(
        "border-border bg-background/95 supports-backdrop-filter:backdrop-blur-md fixed right-0 bottom-0 left-0 z-50",
        "border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg",
      )}
      role="region"
      aria-label={tx({ es: "Instalar aplicación", en: "Install app" })}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="text-muted-foreground flex min-w-0 flex-1 items-start gap-2 text-sm sm:items-center">
          <Download className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="min-w-0">
            {deferred ? (
              <>
                <span className="text-foreground font-medium">{t.pwa.installTitle}</span>{" "}
                {tx({
                  es: "— acceso rápido desde la pantalla de inicio, como una app.",
                  en: "— quick access from your home screen, like an app.",
                })}
              </>
            ) : iosHint ? (
              <>
                {tx({
                  es: (
                    <>
                      <span className="text-foreground font-medium">Añadí Clara a Inicio</span>: tocá{" "}
                      <span className="text-foreground">Compartir</span> y elegí &quot;Añadir a
                      inicio&quot;.
                    </>
                  ),
                  en: (
                    <>
                      <span className="text-foreground font-medium">Add Clara to Home</span>: tap{" "}
                      <span className="text-foreground">Share</span> and choose &quot;Add to Home
                      Screen&quot;.
                    </>
                  ),
                })}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          {deferred ? (
            <Button type="button" size="sm" onClick={onInstall}>
              {t.pwa.install}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={dismiss}
            aria-label={tx({ es: "Cerrar sugerencia", en: "Dismiss suggestion" })}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
