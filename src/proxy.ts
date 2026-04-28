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

function isPublicPathname(pathname: string): boolean {
  if (pathname === "/") return true;
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
    "/((?!api/auth|api/webhooks|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|llms.txt|llms-full.txt|openapi.json|\\.well-known|opengraph-image|twitter-image|manifest.webmanifest|sw.js|icon.svg|apple-icon|manifest-icon).*)",
  ],
};
