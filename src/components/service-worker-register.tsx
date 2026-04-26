"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker once on mount. Kept out of the dev
 * environment because Next's HMR fights with cached SW responses.
 *
 * The worker itself is a stub today (see `public/sw.js`) — it satisfies
 * the Chromium installability check and gives us a hook for future
 * offline support without changing the rest of the app.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((err) => {
        console.warn("[pwa] service worker registration failed", err);
      });
  }, []);

  return null;
}
