import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { marketingContent } from "@/lib/marketing-content";
import { privacyCopy } from "@/lib/marketing-pages";
import { pick } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n/locale";
import { breadcrumbJsonLd, buildMetadata, jsonLdScript } from "@/lib/seo";

type PageProps = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const copy = privacyCopy(lang);
  return buildMetadata({
    title: copy.metaTitle,
    description: copy.metaDescription,
    path: `/${lang}/privacy`,
    locale: lang,
    pathByLocale: { es: "/es/privacy", en: "/en/privacy" },
  });
}

export function generateStaticParams() {
  return [{ lang: "es" }, { lang: "en" }];
}

const LAST_UPDATED = "2026-04-28";

export default async function PrivacyPage({ params }: PageProps) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;
  const copy = privacyCopy(locale);
  const { PRIVACY_SECTIONS } = marketingContent(locale);

  const lastUpdatedLabel = pick(locale, {
    es: "Última actualización:",
    en: "Last updated:",
  });
  const contactHeading = pick(locale, { es: "Contacto", en: "Contact" });
  const contactCopy = pick(locale, {
    es: {
      lead: "Para cualquier consulta sobre privacidad, abrí un issue en",
      via: "o contactanos vía",
    },
    en: {
      lead: "For any privacy question, open an issue at",
      via: "or reach out via",
    },
  });
  const contactBody = (
    <>
      {contactCopy.lead}{" "}
      <a
        className="text-foreground decoration-lime decoration-[3px] underline-offset-4 hover:underline"
        href="https://github.com/kyberis/etracker/issues"
        target="_blank"
        rel="noopener noreferrer"
      >
        github.com/kyberis/etracker/issues
      </a>{" "}
      {contactCopy.via}{" "}
      <a
        className="text-foreground decoration-lime decoration-[3px] underline-offset-4 hover:underline"
        href="https://trefolio.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        trefolio.com
      </a>
      .
    </>
  );

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <script
        {...jsonLdScript([
          breadcrumbJsonLd([
            { name: pick(locale, { es: "Inicio", en: "Home" }), path: `/${locale}` },
            { name: copy.metaTitle, path: `/${locale}/privacy` },
          ]),
        ])}
      />

      <header className="mb-10 space-y-3">
        <span className="sticker sticker-lime">{copy.chip}</span>
        <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">
          {copy.title1}
          <span className="hl">{copy.titleHighlight}</span>
          {copy.titleSuffix}
        </h1>
        <p className="text-muted-foreground">
          {lastUpdatedLabel} <time dateTime={LAST_UPDATED}>{LAST_UPDATED}</time>.
        </p>
      </header>

      <div className="space-y-10">
        {PRIVACY_SECTIONS.map(({ heading, body }) => (
          <section key={heading} className="space-y-3">
            <h2 className="font-display text-2xl font-bold">{heading}</h2>
            {body.map((p, idx) => (
              <p key={idx} className="text-muted-foreground leading-relaxed">
                {p}
              </p>
            ))}
          </section>
        ))}

        <section className="space-y-3">
          <h2 className="font-display text-2xl font-bold">{contactHeading}</h2>
          <p className="text-muted-foreground leading-relaxed">{contactBody}</p>
        </section>
      </div>
    </article>
  );
}
