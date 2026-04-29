import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { marketingContent } from "@/lib/marketing-content";
import { changelogCopy } from "@/lib/marketing-pages";
import { isLocale, type Locale } from "@/lib/i18n/locale";
import {
  breadcrumbJsonLd,
  buildMetadata,
  getSiteUrl,
  jsonLdScript,
  ORG_LEGAL_NAME,
  ORG_URL,
} from "@/lib/seo";

type PageProps = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const copy = changelogCopy(lang);
  return buildMetadata({
    title: copy.metaTitle,
    description: copy.metaDescription,
    path: `/${lang}/changelog`,
    locale: lang,
    pathByLocale: { es: "/es/changelog", en: "/en/changelog" },
  });
}

export function generateStaticParams() {
  return [{ lang: "es" }, { lang: "en" }];
}

export default async function ChangelogPage({ params }: PageProps) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;
  const copy = changelogCopy(locale);
  const { CHANGELOG } = marketingContent(locale);

  const site = getSiteUrl();
  const articles = CHANGELOG.map((entry) => ({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${entry.version} — ${entry.title}`,
    datePublished: entry.date,
    dateModified: entry.date,
    author: { "@type": "Organization", name: ORG_LEGAL_NAME, url: ORG_URL },
    publisher: { "@type": "Organization", name: ORG_LEGAL_NAME, url: ORG_URL },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${site}/${locale}/changelog` },
    description: entry.highlights.join(" "),
  }));

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <script
        {...jsonLdScript([
          breadcrumbJsonLd([
            { name: locale === "en" ? "Home" : "Inicio", path: `/${locale}` },
            { name: copy.metaTitle, path: `/${locale}/changelog` },
          ]),
          ...articles,
        ])}
      />

      <header className="mb-10 space-y-3">
        <span className="sticker sticker-lime">{copy.chip}</span>
        <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">
          {copy.title1}
          <span className="hl">{copy.titleHighlight}</span>
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">{copy.intro}</p>
      </header>

      <ol className="space-y-8">
        {CHANGELOG.map((entry) => (
          <li key={entry.version} className="surface-card p-6">
            <header className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="font-display text-xl font-bold">
                v{entry.version}{" "}
                <span className="text-muted-foreground text-base font-normal">
                  · {entry.title}
                </span>
              </h2>
              <time
                dateTime={entry.date}
                className="text-muted-foreground text-xs font-mono"
              >
                {copy.publishedOn(entry.date)}
              </time>
            </header>
            <ul className="text-muted-foreground list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
              {entry.highlights.map((h, idx) => (
                <li key={idx}>{h}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </article>
  );
}
