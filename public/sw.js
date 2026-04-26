// Minimal service worker for the eTracker PWA.
//
// We don't pre-cache anything yet because the app is auth-gated and
// most data is dynamic per user. Having a registered worker with a
// `fetch` listener is what unlocks the Chromium "Add to home screen"
// installability prompt and lays the ground for offline support
// (cache-first for assets, network-first for API) later on.

const VERSION = "v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Pass-through: let the network handle every request for now.
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

console.info(`[sw] eTracker service worker ${VERSION} ready`);
