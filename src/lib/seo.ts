import type { Metadata } from "next";

import { type Locale, toBcp47 } from "@/lib/i18n/locale";
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

export const SITE_TAGLINE_ES = "Tu asistente financiera con IA";
export const SITE_TAGLINE_EN = "Your AI financial assistant";
export const SITE_TAGLINE = SITE_TAGLINE_ES;

export const SITE_DESCRIPTION_ES =
  "Clara es una asistente financiera con IA: planificá gastos, mirá tu balance mes a mes, mandá notas de voz por WhatsApp, importá extractos PDF y conectá tu banco vía Open Banking. Open source, MIT, self-hostable.";
export const SITE_DESCRIPTION_EN =
  "Clara is an AI financial assistant: plan expenses, check your monthly balance, send voice notes over WhatsApp, import PDF statements and connect your bank via Open Banking. Open source, MIT, self-hostable.";
export const SITE_DESCRIPTION = SITE_DESCRIPTION_ES;

export function siteTagline(locale: Locale): string {
  return locale === "en" ? SITE_TAGLINE_EN : SITE_TAGLINE_ES;
}

export function siteDescription(locale: Locale): string {
  return locale === "en" ? SITE_DESCRIPTION_EN : SITE_DESCRIPTION_ES;
}

const KEYWORDS_ES = [
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

const KEYWORDS_EN = [
  "financial assistant",
  "AI financial assistant",
  "expense tracker",
  "AI expense tracker",
  "monthly budget",
  "spending tracker",
  "open banking",
  "Revolut",
  "WhatsApp finance",
  "bank PDF statements",
  "self-hosted finance",
  "Next.js finance",
  "MCP finance",
  "MCP Claude finance",
  "AI agent finance",
];

export function siteKeywords(locale: Locale): string[] {
  return locale === "en" ? KEYWORDS_EN : KEYWORDS_ES;
}

export const SITE_KEYWORDS: string[] = KEYWORDS_ES;

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
  /**
   * Active locale for the page. Drives `og:locale`, the language alternates
   * (hreflang) and the canonical link.
   */
  locale?: Locale;
  /**
   * Locale-aware paths used to emit `alternates.languages` (hreflang). When
   * provided, the canonical link uses the entry matching `locale`.
   */
  pathByLocale?: Partial<Record<Locale, string>>;
};

/**
 * Build a `Metadata` object for a marketing/public page with consistent
 * OpenGraph + Twitter cards, canonical URL, robots policy and language
 * alternates.
 */
export function buildMetadata({
  title,
  description,
  path = "/",
  image,
  ogType = "website",
  index = true,
  article,
  locale = "es",
  pathByLocale,
}: BuildMetadataInput): Metadata {
  const resolvedDescription = description ?? siteDescription(locale);
  const url = path.startsWith("http") ? path : path;
  const canonicalPath = pathByLocale?.[locale] ?? (path === "/" ? "/" : path);

  const ogImages = image
    ? [{ url: image, width: 1200, height: 630, alt: `${SITE_NAME} — ${title}` }]
    : undefined;

  // hreflang map: prefer per-locale paths when provided; otherwise default
  // to the same path for both locales (legacy behaviour).
  const esPath = pathByLocale?.es ?? canonicalPath;
  const enPath = pathByLocale?.en ?? canonicalPath;

  return {
    title,
    description: resolvedDescription,
    alternates: {
      canonical: canonicalPath,
      languages: {
        "es-AR": esPath,
        es: esPath,
        "en-US": enPath,
        en: enPath,
        "x-default": esPath,
      },
    },
    openGraph: {
      type: ogType,
      title: `${title} · ${SITE_NAME}`,
      description: resolvedDescription,
      siteName: SITE_NAME,
      locale: locale === "en" ? "en_US" : "es_AR",
      url,
      images: ogImages,
      ...(article ? { ...article } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · ${SITE_NAME}`,
      description: resolvedDescription,
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

/** Re-export so callers can write `<html lang={htmlLang(locale)} />`. */
export const htmlLang = toBcp47;

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
    inLanguage: ["es-AR", "en-US"],
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
    inLanguage: ["es-AR", "en-US"],
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
