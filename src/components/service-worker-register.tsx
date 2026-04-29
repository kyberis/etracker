"use client";

import { useEffect } from "react";

/**
 * Registra el service worker de la PWA y se ocupa de los updates.
 *
 * En cuanto detectamos un worker `installed` en `waiting` (porque hubo deploy),
 * lo activamos sin pedirle nada al usuario para que la próxima navegación
 * use la versión nueva. No recargamos automáticamente: dejamos que la app
 * tome el control en el siguiente `controllerchange`.
 *
 * Solo activo en producción: con HMR de Next, el SW pelea con las respuestas
 * cacheadas y rompe el dev loop.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    let cancelled = false;
    let detachVisibility: (() => void) | null = null;

    const promoteWaiting = (registration: ServiceWorkerRegistration) => {
      const waiting = registration.waiting;
      if (waiting) {
        waiting.postMessage("skipWaiting");
      }
    };

    const watchForUpdates = (registration: ServiceWorkerRegistration) => {
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            promoteWaiting(registration);
          }
        });
      });
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        if (cancelled) return;
        if (registration.waiting) promoteWaiting(registration);
        watchForUpdates(registration);

        // Chequeo de updates cuando la pestaña vuelve a estar visible:
        // captura nuevas versiones sin esperar a un refresh manual.
        const onVisibility = () => {
          if (document.visibilityState === "visible") {
            registration.update().catch(() => {
              /* noop */
            });
          }
        };
        document.addEventListener("visibilitychange", onVisibility);
        detachVisibility = () => document.removeEventListener("visibilitychange", onVisibility);
      })
      .catch((err) => {
        console.warn("[pwa] service worker registration failed", err);
      });

    return () => {
      cancelled = true;
      detachVisibility?.();
    };
  }, []);

  return null;
}
