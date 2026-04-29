import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { marketingContent } from "@/lib/marketing-content";
import { faqCopy } from "@/lib/marketing-pages";
import { isLocale, type Locale } from "@/lib/i18n/locale";
import {
  breadcrumbJsonLd,
  buildMetadata,
  faqJsonLd,
  jsonLdScript,
} from "@/lib/seo";

type PageProps = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ q?: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const copy = faqCopy(lang);
  return buildMetadata({
    title: copy.metaTitle,
    description: copy.metaDescription,
    path: `/${lang}/faq`,
    locale: lang,
    pathByLocale: { es: "/es/faq", en: "/en/faq" },
  });
}

export function generateStaticParams() {
  return [{ lang: "es" }, { lang: "en" }];
}

export default async function FaqPage({ params, searchParams }: PageProps) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;
  const copy = faqCopy(locale);
  const { FAQ } = marketingContent(locale);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const filtered = q
    ? FAQ.filter(
        (entry) =>
          entry.question.toLowerCase().includes(q) ||
          entry.answer.toLowerCase().includes(q),
      )
    : FAQ;

  const noMatchLabel = locale === "en"
    ? `No questions matched "${q}".`
    : `No encontramos preguntas que matcheen "${q}".`;

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <script
        {...jsonLdScript([
          faqJsonLd(FAQ),
          breadcrumbJsonLd([
            { name: locale === "en" ? "Home" : "Inicio", path: `/${locale}` },
            { name: "FAQ", path: `/${locale}/faq` },
          ]),
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

      {q && filtered.length === 0 ? (
        <p className="text-muted-foreground">{noMatchLabel}</p>
      ) : null}

      <dl className="space-y-6">
        {filtered.map(({ question, answer }) => {
          const id = `faq-${question
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")}`;
          return (
            <div key={question} id={id} className="surface-card p-5">
              <dt className="font-display text-lg font-semibold">
                <a href={`#${id}`} className="hover:underline">
                  {question}
                </a>
              </dt>
              <dd className="text-muted-foreground mt-2 leading-relaxed">{answer}</dd>
            </div>
          );
        })}
      </dl>
    </article>
  );
}
