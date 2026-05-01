import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { marketingContent } from "@/lib/marketing-content";
import { termsCopy } from "@/lib/marketing-pages";
import { pick } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n/locale";
import {
  CURRENT_TERMS_VERSION,
  TERMS_LAST_UPDATED,
  legalController,
} from "@/lib/legal";
import { breadcrumbJsonLd, buildMetadata, jsonLdScript } from "@/lib/seo";

type PageProps = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const copy = termsCopy(lang);
  return buildMetadata({
    title: copy.metaTitle,
    description: copy.metaDescription,
    path: `/${lang}/terms`,
    locale: lang,
    pathByLocale: { es: "/es/terms", en: "/en/terms" },
  });
}

export function generateStaticParams() {
  return [{ lang: "es" }, { lang: "en" }];
}

export default async function TermsPage({ params }: PageProps) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;
  const copy = termsCopy(locale);
  const { TERMS_SECTIONS } = marketingContent(locale);
  const controller = legalController();

  const lastUpdatedLabel = pick(locale, {
    es: "Última actualización:",
    en: "Last updated:",
  });
  const versionLabel = pick(locale, {
    es: `Versión ${CURRENT_TERMS_VERSION}`,
    en: `Version ${CURRENT_TERMS_VERSION}`,
  });
  const controllerLabel = pick(locale, {
    es: "Responsable / Operador:",
    en: "Operator:",
  });
  const jurisdictionLabel = pick(locale, {
    es: "Jurisdicción:",
    en: "Jurisdiction:",
  });
  const contactCtaLabel = pick(locale, {
    es: "Ir al formulario de contacto",
    en: "Go to the contact form",
  });
  const selfHostBanner = pick(locale, {
    es:
      "Esta instancia de Clara está self-hosteada y todavía no configuró su responsable. Pedile al operador que setee LEGAL_CONTROLLER_NAME y LEGAL_JURISDICTION antes de aceptar usuarios reales.",
    en:
      "This Clara instance is self-hosted and has not configured its operator yet. Ask the operator to set LEGAL_CONTROLLER_NAME and LEGAL_JURISDICTION before accepting real users.",
  });

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <script
        {...jsonLdScript([
          breadcrumbJsonLd([
            { name: pick(locale, { es: "Inicio", en: "Home" }), path: `/${locale}` },
            { name: copy.metaTitle, path: `/${locale}/terms` },
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
          {lastUpdatedLabel}{" "}
          <time dateTime={TERMS_LAST_UPDATED}>{TERMS_LAST_UPDATED}</time> ·{" "}
          {versionLabel}
        </p>
        <p className="text-muted-foreground text-sm">
          <strong className="text-foreground">{controllerLabel}</strong>{" "}
          {controller.name} ·{" "}
          <strong className="text-foreground">{jurisdictionLabel}</strong>{" "}
          {controller.jurisdiction}
        </p>
        <p className="text-muted-foreground">{copy.intro}</p>
      </header>

      {controller.selfHosted ? (
        <aside className="mb-8 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          {selfHostBanner}
        </aside>
      ) : null}

      <div className="space-y-10">
        {TERMS_SECTIONS.map(({ heading, body }) => (
          <section key={heading} className="space-y-3">
            <h2 className="font-display text-2xl font-bold">{heading}</h2>
            {body.map((p, idx) => (
              <p key={idx} className="text-muted-foreground leading-relaxed">
                {p}
              </p>
            ))}
          </section>
        ))}

        <div className="pt-4">
          <Link
            href={`/${locale}/contact`}
            className="bg-foreground text-background hover:bg-foreground/90 inline-flex h-10 items-center rounded-full px-5 text-sm font-semibold shadow-sm transition-colors"
          >
            {contactCtaLabel} →
          </Link>
        </div>
      </div>
    </article>
  );
}
