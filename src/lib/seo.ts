import type { Metadata } from "next";

import { getPublicAppBaseUrl } from "@/lib/public-app-url";

/**
 * Default canonical origin used when no `NEXT_PUBLIC_APP_URL` / `VERCEL_URL`
 * is set (local builds, prerender during `next build`). Keep this aligned
 * with the production domain.
 */
export const DEFAULT_SITE_URL = "https://ada.trefolio.com";

export function getSiteUrl(): string {
  return getPublicAppBaseUrl() ?? DEFAULT_SITE_URL;
}

export const SITE_NAME = "Clara";
export const SITE_TAGLINE = "Tu asistente financiera con IA";
export const SITE_DESCRIPTION =
  "Clara es una asistente financiera con IA: planificá gastos, mirá tu balance mes a mes, mandá notas de voz por WhatsApp, importá extractos PDF y conectá tu banco vía Open Banking. Open source, MIT, self-hostable.";

export const SITE_KEYWORDS: string[] = [
  "asistente financiera",
  "asistente financiera con IA",
  "expense tracker",
  "expense tracker con IA",
  "presupuesto mensual",
  "control de gastos",
  "open banking",
  "Revolut",
  "WhatsApp finanzas",
  "PDF extractos bancarios",
  "self-hosted finanzas",
  "Next.js finanzas",
  "MCP finanzas",
  "MCP Claude finanzas",
  "AI agent finanzas",
];

export const ORG_LEGAL_NAME = "Trefolio";
export const ORG_URL = "https://trefolio.com";
export const SUPPORT_URL = "https://github.com/kyberis/etracker/issues";
export const SOURCE_URL = "https://github.com/kyberis/etracker";

type BuildMetadataInput = {
  title: string;
  description?: string;
  path?: string;
  image?: string;
  /** Override the OpenGraph type (defaults to "website"). */
  ogType?: "website" | "article";
  /** Set to false to mark the page noindex (used for the auth surface). */
  index?: boolean;
  /** Article metadata (changelog entries, etc.). */
  article?: {
    publishedTime?: string;
    modifiedTime?: string;
    section?: string;
    tags?: string[];
  };
};

/**
 * Build a `Metadata` object for a marketing/public page with consistent
 * OpenGraph + Twitter cards, canonical URL, robots policy and language
 * alternates.
 */
export function buildMetadata({
  title,
  description = SITE_DESCRIPTION,
  path = "/",
  image,
  ogType = "website",
  index = true,
  article,
}: BuildMetadataInput): Metadata {
  const url = path.startsWith("http") ? path : path;
  const canonical = path === "/" ? "/" : path;

  const ogImages = image
    ? [{ url: image, width: 1200, height: 630, alt: `${SITE_NAME} — ${title}` }]
    : undefined;

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: {
        "es-AR": canonical,
        es: canonical,
        "x-default": canonical,
      },
    },
    openGraph: {
      type: ogType,
      title: `${title} · ${SITE_NAME}`,
      description,
      siteName: SITE_NAME,
      locale: "es_AR",
      url,
      images: ogImages,
      ...(article ? { ...article } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · ${SITE_NAME}`,
      description,
      images: image ? [image] : undefined,
    },
    robots: index
      ? {
          index: true,
          follow: true,
          googleBot: { index: true, follow: true, "max-image-preview": "large" },
        }
      : { index: false, follow: false },
  };
}

/**
 * JSON-LD `Organization` describing Trefolio (the team behind Clara).
 */
export function organizationJsonLd() {
  const site = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: ORG_LEGAL_NAME,
    url: ORG_URL,
    logo: `${site}/clara-icon.png`,
    sameAs: [SOURCE_URL, ORG_URL],
  };
}

/**
 * JSON-LD `WebSite` with a `SearchAction` for FAQ/changelog text search.
 */
export function websiteJsonLd() {
  const site = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: SITE_TAGLINE,
    url: site,
    inLanguage: ["es-AR", "es"],
    publisher: { "@type": "Organization", name: ORG_LEGAL_NAME, url: ORG_URL },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${site}/faq?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * JSON-LD `SoftwareApplication` describing Clara.
 */
export function softwareApplicationJsonLd() {
  const site = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    alternateName: "Clara — Asistente financiera",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web, iOS (PWA), Android (PWA)",
    url: site,
    description: SITE_DESCRIPTION,
    inLanguage: ["es-AR", "es"],
    softwareVersion: "0.1.0",
    license: "https://opensource.org/licenses/MIT",
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    author: { "@type": "Organization", name: ORG_LEGAL_NAME, url: ORG_URL },
    publisher: { "@type": "Organization", name: ORG_LEGAL_NAME, url: ORG_URL },
    featureList: [
      "Chat IA conversacional para registrar gastos",
      "Importación de PDFs y CSVs bancarios",
      "Notas de voz vía WhatsApp",
      "Open Banking con Revolut (solo lectura, Clara nunca accede a tu dinero)",
      "Planificación mensual con plantillas recurrentes",
      "Multi-banco con desglose por cuenta",
      "Servidor MCP para integración con Claude / ChatGPT / Cursor",
      "Open source MIT, self-hostable",
    ],
  };
}

export type FaqEntry = { question: string; answer: string };

export function faqJsonLd(entries: FaqEntry[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}

export type Crumb = { name: string; path: string };

export function breadcrumbJsonLd(crumbs: Crumb[]) {
  const site = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${site}${c.path}`,
    })),
  };
}

/**
 * Render JSON-LD payload(s) as a `<script type="application/ld+json">` props
 * object. Use as: `<script {...jsonLdScript(payload)} />` inside a Server
 * Component.
 */
export function jsonLdScript(data: unknown | unknown[]): {
  type: "application/ld+json";
  dangerouslySetInnerHTML: { __html: string };
} {
  return {
    type: "application/ld+json",
    dangerouslySetInnerHTML: { __html: JSON.stringify(data) },
  };
}
