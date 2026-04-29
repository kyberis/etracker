/* eslint-disable no-restricted-globals */
// Service worker para Clara (eTracker PWA).
//
// Estrategias:
//   - Precache mínimo del "app shell" (manifest, íconos y la pantalla offline).
//   - Cache-first + long-lived para los assets inmutables de Next (`/_next/static`).
//   - Stale-while-revalidate para imágenes/fuentes/svg del propio origen.
//   - Network-first con timeout para navegaciones (HTML) y fallback a `/offline`.
//   - Bypass total para POST/PUT/DELETE/PATCH y para todo lo que cuelga de
//     `/api/`, `/auth/` y los webhooks: nada de respuestas viejas en flujos
//     autenticados o que muten datos.
//
// La versión se bumpea para invalidar caches viejos al desplegar cambios al SW.

const VERSION = "v3";
const PRECACHE = `clara-precache-${VERSION}`;
const STATIC_CACHE = `clara-static-${VERSION}`;
const ASSETS_CACHE = `clara-assets-${VERSION}`;
const PAGES_CACHE = `clara-pages-${VERSION}`;

const OFFLINE_URL = "/offline";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/clara-icon-192.png",
  "/clara-icon-512.png",
  "/clara-icon-maskable.png",
];

const NAVIGATION_TIMEOUT_MS = 3500;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      // `reload` evita que Chrome sirva una versión cacheada por el HTTP cache
      // del navegador y la guarde en el SW como "fresca".
      await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: "reload" })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PRECACHE, STATIC_CACHE, ASSETS_CACHE, PAGES_CACHE]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
      // Habilita Navigation Preload donde esté disponible: el navegador
      // arranca el fetch de red en paralelo al boot del SW, eliminando el
      // overhead típico de "primer hit con SW recién despertado".
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {
          /* noop */
        }
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

function isStaticBuildAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

function isSameOriginAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return /\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|css)$/i.test(url.pathname);
}

function isApiOrAuth(url) {
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/_next/data/")
  );
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

async function networkFirstNavigation(event) {
  const cache = await caches.open(PAGES_CACHE);

  // Si el browser ya arrancó la respuesta vía Navigation Preload, usémosla.
  const preload = event.preloadResponse ? await event.preloadResponse.catch(() => null) : null;

  try {
    const fetchPromise = preload || fetch(event.request);
    const response = await Promise.race([
      fetchPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("network-timeout")), NAVIGATION_TIMEOUT_MS),
      ),
    ]);
    if (response && response.ok && response.type === "basic") {
      cache.put(event.request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    return (
      offline ||
      new Response("Sin conexión", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Nunca cachear flujos autenticados ni mutaciones server-side.
  if (isApiOrAuth(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(event));
    return;
  }

  if (isStaticBuildAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (isSameOriginAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, ASSETS_CACHE));
    return;
  }
});

console.info(`[sw] Clara service worker ${VERSION} ready`);
