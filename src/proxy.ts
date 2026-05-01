import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_COOKIE,
  isLocale,
  normalizeLocale,
  pickFromAcceptLanguage,
} from "@/lib/i18n/locale";

/**
 * Marketing paths that have a localised version under `(marketing)/[lang]`.
 * Anything in this list will be redirected from `/about` to
 * `/{detected-locale}/about` on first request (and the cookie is set).
 */
const MARKETING_ROUTES = ["about", "features", "faq", "privacy", "changelog"];

const APP_PUBLIC_ROUTES = ["/login", "/register"];

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

/**
 * `/<locale>/...`-shaped paths. We treat any `/es/*` or `/en/*` path as
 * public marketing.
 */
function getLocalePrefix(pathname: string): {
  locale: string | null;
  rest: string;
} {
  const match = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!match) return { locale: null, rest: pathname };
  const candidate = match[1];
  const rest = match[2] ?? "/";
  if (isLocale(candidate)) {
    return { locale: candidate, rest };
  }
  return { locale: null, rest: pathname };
}

function isPublicPathname(pathname: string): boolean {
  if (pathname === "/") return true;
  if (STATIC_ASSET_RE.test(pathname)) return true;
  if (
    APP_PUBLIC_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    )
  ) {
    return true;
  }
  if (
    PUBLIC_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return true;
  }
  // /es/... or /en/... — the marketing layout segment.
  const { locale } = getLocalePrefix(pathname);
  if (locale) return true;
  return false;
}

/**
 * Bare marketing paths that should be redirected to `/{locale}/...`. We do
 * this in the proxy so deep links and crawlers reaching `/about` still work
 * (and pick up the user's `Accept-Language` / cookie for the redirect
 * target).
 */
function findMarketingRoute(pathname: string): string | null {
  for (const route of MARKETING_ROUTES) {
    if (pathname === `/${route}` || pathname.startsWith(`/${route}/`)) {
      return route;
    }
  }
  return null;
}

function detectLocale(request: NextRequest): "es" | "en" {
  const cookieValue = request.cookies.get(LOCALE_COOKIE)?.value;
  if (cookieValue) {
    return normalizeLocale(cookieValue);
  }
  return pickFromAcceptLanguage(request.headers.get("accept-language"));
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // Static assets (PNG/SVG/CSS/etc.) skip the auth check entirely — no token
  // lookup needed. Saves a JWT decode per asset request.
  if (STATIC_ASSET_RE.test(pathname)) {
    return NextResponse.next();
  }

  const detectedLocale = detectLocale(request);

  // Bare marketing paths (`/about`, `/features`, ...) → /{locale}/<path>.
  const marketingRoute = findMarketingRoute(pathname);
  if (marketingRoute) {
    const url = request.nextUrl.clone();
    url.pathname = `/${detectedLocale}${pathname}`;
    const response = NextResponse.redirect(url);
    if (!request.cookies.get(LOCALE_COOKIE)) {
      response.cookies.set(LOCALE_COOKIE, detectedLocale, {
        path: "/",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    return response;
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

  const response = NextResponse.next();
  // Lazily seed the locale cookie when missing (first visit, no JS run yet).
  // Server Components rely on this for `getLocaleFromRequest()`.
  if (!request.cookies.get(LOCALE_COOKIE)) {
    response.cookies.set(LOCALE_COOKIE, detectedLocale, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

// Re-exported so `proxy.ts` consumers can keep referencing the same value.
export const SUPPORTED_LOCALES = LOCALES;
export { DEFAULT_LOCALE };

export const config = {
  matcher: [
    // Skip auth for: NextAuth, the Telegram webhook (called with no session
    // cookie), static assets, favicon/sitemap/robots/llms files, the PWA
    // public assets, OpenGraph/Twitter image generators, .well-known and
    // OpenAPI/MCP discovery endpoints.
    "/((?!api/auth|api/webhooks|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|llms.txt|llms-full.txt|openapi.json|\\.well-known|opengraph-image|twitter-image|manifest.webmanifest|sw.js|icon.svg|apple-icon|manifest-icon).*)",
  ],
};
