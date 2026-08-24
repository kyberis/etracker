import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Keep pdf-parse (and its native canvas) outside the Next.js server bundle.
   * Bundling them into `.next/server/chunks/` breaks the pdfjs fake-worker
   * path on Vercel (`Cannot find module '.../pdf.worker.mjs'` → extract-pdf 500).
   * See pdf-parse troubleshooting + `src/lib/pdf-extract.ts`.
   */
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  /** Local HTTPS hostname (see repo root `dev/Caddyfile`) — allows dev HMR when the browser uses `clara.trefolio-dev.com`. */
  allowedDevOrigins: ["clara.trefolio-dev.com"],
  async headers() {
    return [
      {
        // The service worker must always be served fresh and with the
        // right MIME type so Chrome accepts it. `Service-Worker-Allowed`
        // lets us register it for the whole origin even if served from
        // a sub-path during preview deploys.
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
