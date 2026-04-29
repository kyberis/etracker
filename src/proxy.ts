import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Routes anyone can hit without being logged in. Marketing pages live at the
 * root of the site so search engines and AI crawlers (GPTBot, ClaudeBot,
 * PerplexityBot, etc.) can index them; the actual app sits behind `/app`.
 */
const publicRoutes = [
  "/login",
  "/register",
  "/about",
  "/features",
  "/faq",
  "/privacy",
  "/changelog",
];

const PUBLIC_PREFIXES = ["/api/mcp"];

/**
 * File extensions for assets that must never be auth-gated. Hitting the
 * proxy for these breaks the Next.js image optimizer in particular: when
 * `<Image src="/foo.png" />` requests `/_next/image?url=/foo.png`, the
 * optimizer fetches the original bytes through this same origin. If the
 * proxy redirects that fetch to `/login`, the optimizer sees a 307 with no
 * image body and returns 400 ("The requested resource isn't a valid image"),
 * which silently breaks every avatar in the app for non-logged-in flows AND
 * for some internal SSR-time fetches even with a session cookie.
 */
const STATIC_ASSET_RE =
  /\.(?:png|jpe?g|gif|svg|webp|ico|avif|woff2?|ttf|otf|map|css|js|mjs|json|txt|xml|webmanifest)$/i;

function isPublicPathname(pathname: string): boolean {
  if (pathname === "/") return true;
  if (STATIC_ASSET_RE.test(pathname)) return true;
  if (publicRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return true;
  }
  if (PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true;
  }
  return false;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // Static assets (PNG/SVG/CSS/etc.) skip the auth check entirely — no token
  // lookup needed. Saves a JWT decode per asset request.
  if (STATIC_ASSET_RE.test(pathname)) {
    return NextResponse.next();
  }
  const isPublic = isPublicPathname(pathname);
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (!token && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Logged-in users hitting login/register get pushed into the app.
  if (token && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip auth for: NextAuth, the WhatsApp webhook (called by Twilio with no
    // session cookie), static assets, favicon/sitemap/robots/llms files, the
    // PWA public assets, OpenGraph/Twitter image generators, .well-known and
    // OpenAPI/MCP discovery endpoints.
    "/((?!api/auth|api/webhooks|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|llms.txt|llms-full.txt|openapi.json|\\.well-known|opengraph-image|twitter-image|manifest.webmanifest|sw.js|icon\\.|apple-icon).*)",
  ],
};
