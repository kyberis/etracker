import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n/locale";
import { marketingContent } from "@/lib/marketing-content";
import { breadcrumbJsonLd, buildMetadata, jsonLdScript } from "@/lib/seo";

import { ContactForm } from "./form";

type PageProps = {
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const copy = marketingContent(lang).CONTACT_COPY;
  return buildMetadata({
    title: copy.metaTitle,
    description: copy.metaDescription,
    path: `/${lang}/contact`,
    locale: lang,
    pathByLocale: { es: "/es/contact", en: "/en/contact" },
  });
}

export function generateStaticParams() {
  return [{ lang: "es" }, { lang: "en" }];
}

/**
 * Public contact page. Server component that:
 *  - reads the authenticated user (if any) so the client form can prefill
 *    `name` and `email` while still letting the user edit them; and
 *  - renders breadcrumb JSON-LD for SEO parity with the rest of the
 *    marketing surface.
 */
export default async function ContactPage({ params }: PageProps) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;
  const copy = marketingContent(locale).CONTACT_COPY;

  const session = await getAuthSession();
  let prefill: { name: string; email: string } | null = null;
  if (session?.user?.id) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, name: true },
    });
    if (user) {
      prefill = {
        name: user.name ?? "",
        email: user.email,
      };
    }
  }

  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <script
        {...jsonLdScript([
          breadcrumbJsonLd([
            { name: pick(locale, { es: "Inicio", en: "Home" }), path: `/${locale}` },
            { name: copy.metaTitle, path: `/${locale}/contact` },
          ]),
        ])}
      />

      <header className="mb-8 space-y-3">
        <span className="sticker sticker-lime">{copy.chip}</span>
        <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">
          {copy.title1}
          <span className="hl">{copy.titleHighlight}</span>
          {copy.titleSuffix}
        </h1>
        <p className="text-muted-foreground leading-relaxed">{copy.intro}</p>
      </header>

      <ContactForm copy={copy} prefill={prefill} />
    </article>
  );
}
