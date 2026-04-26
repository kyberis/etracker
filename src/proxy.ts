import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const publicRoutes = ["/login", "/register"];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (!token && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (token && isPublicRoute) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip auth for: NextAuth, the WhatsApp webhook (called by Meta with no
    // session cookie), static assets, favicon/sitemap/robots, and the PWA
    // public assets (manifest, icons, service worker).
    "/((?!api/auth|api/webhooks|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|manifest.webmanifest|sw.js|icon.svg|apple-icon|manifest-icon).*)",
  ],
};
