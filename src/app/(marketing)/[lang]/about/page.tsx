import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";

import { marketingContent } from "@/lib/marketing-content";
import { aboutCopy } from "@/lib/marketing-pages";
import { isLocale, type Locale } from "@/lib/i18n/locale";
import {
  breadcrumbJsonLd,
  buildMetadata,
  jsonLdScript,
} from "@/lib/seo";

type PageProps = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const copy = aboutCopy(lang);
  return buildMetadata({
    title: copy.metaTitle,
    description: copy.metaDescription,
    path: `/${lang}/about`,
    locale: lang,
    pathByLocale: { es: "/es/about", en: "/en/about" },
  });
}

export function generateStaticParams() {
  return [{ lang: "es" }, { lang: "en" }];
}

export default async function AboutPage({ params }: PageProps) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;
  const copy = aboutCopy(locale);
  const { FEATURES } = marketingContent(locale);

  return (
    <article className="mx-auto w-full max-w-2xl space-y-14 px-4 py-12 sm:px-6">
      <script
        {...jsonLdScript([
          breadcrumbJsonLd([
            { name: copy.breadcrumbHome, path: `/${locale}` },
            { name: copy.breadcrumbSelf, path: `/${locale}/about` },
          ]),
        ])}
      />

      {/* Hero */}
      <header className="space-y-5">
        <span className="sticker sticker-lime">{copy.heroSticker}</span>
        <h1 className="display text-foreground text-4xl leading-tight sm:text-5xl">
          {copy.heroTitle1}
          <span className="hl">{copy.heroBrand}</span>
          {copy.heroTitle2}
        </h1>
        <p className="text-foreground/80 max-w-prose text-lg leading-relaxed">
          {copy.heroBody}
        </p>
      </header>

      {/* Why Clara */}
      <section className="space-y-5">
        <span className="sticker sticker-pink">{copy.heroSticker}</span>
        <h2 className="display text-foreground text-2xl sm:text-3xl">
          <span className="hl hl-peach">{copy.whyTitle}</span>
        </h2>
        <div className="space-y-4 text-foreground/80 leading-relaxed">
          {copy.whyBody.map((paragraph, idx) => (
            <p key={idx}>{paragraph}</p>
          ))}
        </div>
      </section>

      {/* How it was born */}
      <section className="space-y-5">
        <span className="sticker sticker-violet">trefolio.com</span>
        <h2 className="display text-foreground text-2xl sm:text-3xl">{copy.bornTitle}</h2>

        <div className="surface-card space-y-4 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="sticker sticker-soft">{copy.bornStickerLeft}</span>
            <span className="text-muted-foreground text-xs">{copy.bornStickerRight}</span>
          </div>
          {copy.bornBody.map((paragraph, idx) => (
            <p key={idx} className="text-foreground/80 text-sm leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      {/* Avatar / personality */}
      <section className="space-y-5">
        <div className="ink-card ink-glow flex items-center gap-5 p-6 text-white/90">
          <Image
            src="/clara-avatar-simple.png"
            alt="Clara"
            width={88}
            height={88}
            className="size-20 shrink-0 rounded-full object-cover ring-2 ring-white/15"
          />
          <div className="space-y-1">
            <p className="display text-base font-bold text-white">Clara</p>
            <p className="text-sm leading-relaxed text-white/75">
              {copy.personalityTitle} {copy.personalityBody}
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="space-y-5">
        <span className="sticker sticker-lime">{copy.featuresStickerLabel}</span>
        <h2 className="display text-foreground text-2xl sm:text-3xl">
          {copy.featuresTitle}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map(({ emoji, title, description }) => (
            <li key={title} className="surface-card flex gap-4 p-4">
              <span className="text-2xl" aria-hidden>
                {emoji}
              </span>
              <div className="space-y-0.5">
                <p className="text-foreground text-sm font-semibold">{title}</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Open source */}
      <section className="surface-card space-y-3 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="sticker sticker-soft">{copy.oss.sticker1}</span>
          <span className="sticker sticker-lime">{copy.oss.sticker2}</span>
        </div>
        <h2 className="display text-foreground text-xl">{copy.oss.title}</h2>
        <p className="text-foreground/80 text-sm leading-relaxed">{copy.oss.body}</p>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link
            href="https://github.com/kyberis/etracker"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground decoration-lime decoration-[3px] underline-offset-4 inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            <ExternalLink className="size-3.5" />
            {copy.oss.seeCode}
          </Link>
          <Link
            href="https://github.com/kyberis/etracker/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm hover:underline"
          >
            <ExternalLink className="size-3.5" />
            {copy.oss.reportBug}
          </Link>
        </div>
      </section>

      {/* Made by */}
      <section className="flex flex-wrap items-center justify-between gap-4 text-sm">
        <p className="text-muted-foreground">{copy.madeBy}</p>
        <Link
          href="https://trefolio.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 font-medium transition-colors hover:underline"
        >
          {copy.trefolio}
          <ExternalLink className="size-3.5" />
        </Link>
      </section>
    </article>
  );
}
