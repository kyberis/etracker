import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist_Mono, Schibsted_Grotesk } from "next/font/google";

import "./globals.css";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { intlLocale } from "@/lib/i18n/format";
import { getLocale } from "@/lib/i18n/server";
import {
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_TAGLINE,
  getSiteUrl,
  jsonLdScript,
  organizationJsonLd,
  websiteJsonLd,
} from "@/lib/seo";

const schibsted = Schibsted_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const SITE_URL = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  generator: "Next.js",
  keywords: SITE_KEYWORDS,
  authors: [{ name: "Trefolio", url: "https://trefolio.com" }],
  creator: "Trefolio",
  publisher: "Trefolio",
  category: "finance",
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "/",
    languages: {
      "es-AR": "/es",
      "en-US": "/en",
      "x-default": "/es",
    },
    types: {
      "text/plain": "/llms.txt",
    },
  },
  openGraph: {
    type: "website",
    locale: "es_AR",
    alternateLocale: ["en_US"],
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
    other: {
      // Bing Webmaster Tools (also covers DuckDuckGo / Yahoo / Ecosia indirectly).
      ...(process.env.BING_SITE_VERIFICATION
        ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION }
        : {}),
    },
  },
  other: {
    // Discovery hints for AI clients that look for these in <head>.
    "ai-content-declaration": "human-authored",
    "mcp-server": `${SITE_URL}/api/mcp`,
  },
};

export const viewport: Viewport = {
  themeColor: "#FBEFD3",
  width: "device-width",
  initialScale: 1,
  // Avoid the iOS auto-zoom on input focus while keeping pinch-zoom available.
  maximumScale: 5,
  // Tell Android Chrome to shrink the layout viewport when the on-screen
  // keyboard appears, so the chat composer (`sticky bottom-0` + `100dvh`)
  // sits right above the keyboard instead of being covered by it. iOS
  // Safari already does this by default; this aligns Android with that.
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html
      lang={intlLocale(locale)}
      className={`${schibsted.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}
    >
      <head>
        <link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt" />
        <link
          rel="alternate"
          type="text/plain"
          hrefLang="en"
          href="/en/llms.txt"
          title="llms.txt (en)"
        />
        <link rel="alternate" hrefLang="es-AR" href="/es" />
        <link rel="alternate" hrefLang="en-US" href="/en" />
        <link rel="alternate" hrefLang="x-default" href="/es" />
        <link
          rel="alternate"
          type="application/json"
          href="/.well-known/mcp.json"
          title="MCP server descriptor"
        />
        <script {...jsonLdScript([organizationJsonLd(), websiteJsonLd()])} />
      </head>
      <body className="flex min-h-full flex-col overflow-x-clip">
        {children}
        <ServiceWorkerRegister />
        <PwaInstallPrompt />
      </body>
    </html>
  );
}
