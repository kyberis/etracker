import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { marketingContent } from "@/lib/marketing-content";
import { featuresCopy } from "@/lib/marketing-pages";
import { isLocale, type Locale } from "@/lib/i18n/locale";
import {
  breadcrumbJsonLd,
  buildMetadata,
  jsonLdScript,
  softwareApplicationJsonLd,
} from "@/lib/seo";

type PageProps = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const copy = featuresCopy(lang);
  return buildMetadata({
    title: copy.metaTitle,
    description: copy.metaDescription,
    path: `/${lang}/features`,
    locale: lang,
    pathByLocale: { es: "/es/features", en: "/en/features" },
  });
}

export function generateStaticParams() {
  return [{ lang: "es" }, { lang: "en" }];
}

export default async function FeaturesPage({ params }: PageProps) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;
  const copy = featuresCopy(locale);
  const { FEATURES } = marketingContent(locale);

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <script
        {...jsonLdScript([
          softwareApplicationJsonLd(),
          breadcrumbJsonLd([
            { name: copy.breadcrumbHome, path: `/${locale}` },
            { name: copy.breadcrumbSelf, path: `/${locale}/features` },
          ]),
        ])}
      />

      <header className="mb-12 space-y-4">
        <span className="sticker sticker-lime">{copy.chip}</span>
        <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">
          {copy.title1}
          <br />
          <span className="relative inline-block">
            <span
              className="bg-lime/60 absolute inset-x-[-0.05em] bottom-1 -z-10 h-3 rounded-sm"
              aria-hidden
            />
            {copy.titleHighlight}
          </span>
          {copy.title2}
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">{copy.intro}</p>
      </header>

      <ul className="grid gap-3 pb-10 sm:grid-cols-2">
        {FEATURES.map(({ emoji, title, description }) => (
          <li key={title} className="surface-card flex gap-4 p-4">
            <span className="text-2xl" aria-hidden>
              {emoji}
            </span>
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {description}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="space-y-12">
        {copy.sections.map(({ id, title, body }) => (
          <section key={id} id={id} className="space-y-4">
            <h2 className="font-display text-2xl font-bold">{title}</h2>
            {body.map((paragraph, idx) => (
              <p key={idx} className="text-muted-foreground leading-relaxed">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>

      <div className="border-border/40 mt-16 flex flex-wrap gap-3 border-t pt-10">
        <Link
          href="/register"
          className="bg-foreground text-background hover:bg-foreground/90 inline-flex h-11 items-center rounded-full px-5 text-sm font-semibold shadow-sm transition-colors"
        >
          {copy.cta1}
        </Link>
        <Link
          href={`/${locale}/faq`}
          className="border-border hover:bg-muted inline-flex h-11 items-center rounded-full border px-5 text-sm font-medium transition-colors"
        >
          {copy.cta2}
        </Link>
        <Link
          href="https://github.com/kyberis/etracker"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex h-11 items-center px-3 text-sm font-medium transition-colors"
        >
          {copy.ctaCode}
        </Link>
      </div>
    </article>
  );
}
