import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { isUpsellActive } from "@/lib/billing/stripe";
import {
  SUPPORTER_DAILY_LIMIT,
  SUPPORTER_PRICE_EUR_CENTS,
} from "@/lib/billing/pricing";
import { isLocale, type Locale } from "@/lib/i18n/locale";
import { buildMetadata } from "@/lib/seo";

type PageProps = {
  params: Promise<{ lang: string }>;
};

const COPY: Record<Locale, {
  metaTitle: string;
  metaDescription: string;
  chip: string;
  title: string;
  intro: string;
  benefits: string[];
  donateTitle: string;
  donateBody: string;
  cta: string;
  donateCta: string;
  footnote: string;
  signedOut: string;
}> = {
  es: {
    metaTitle: "Subir a Supporter — Clara",
    metaDescription:
      "Llevá las consultas con Clara a 200 por día por €7,99 al mes. O hacé un aporte único para mantenerla viva.",
    chip: "Supporter",
    title: "Subí a 200 consultas diarias",
    intro:
      "El plan gratuito incluye 30 consultas con Clara por día. Si te queda corto y querés ayudar a mantener la infraestructura, hay dos formas:",
    benefits: [
      "200 consultas con Clara por día (chat web y WhatsApp combinados).",
      "Mismo agente, misma personalidad. Solo más cupo.",
      "Cancelás cuando quieras desde Configuración → Suscripción.",
    ],
    donateTitle: "Donar una vez",
    donateBody:
      "Aporte único, no reembolsable, por el monto que vos elijas. Va directo a infraestructura (servidores + IA). Si donás, tu cupo diario sigue siendo el del plan gratuito; si querés más cupo, suscribite.",
    cta: "Subir a Supporter",
    donateCta: "Donar lo que puedas",
    footnote:
      "Pago vía Stripe Checkout. No guardamos números de tarjeta. Suscripción mensual con renovación automática; cancelás desde el portal de pagos.",
    signedOut:
      "Iniciá sesión en Clara para activar la suscripción o donar.",
  },
  en: {
    metaTitle: "Upgrade to Supporter — Clara",
    metaDescription:
      "Raise your Clara queries to 200 per day for €7.99/mo. Or send a one-time donation to keep her alive.",
    chip: "Supporter",
    title: "Get 200 queries per day",
    intro:
      "The free plan includes 30 Clara queries per day. If that's too tight and you want to help cover infrastructure, here are two ways:",
    benefits: [
      "200 Clara queries per day (web chat and WhatsApp combined).",
      "Same agent, same personality. Just more headroom.",
      "Cancel anytime from Settings → Subscription.",
    ],
    donateTitle: "Donate once",
    donateBody:
      "One-time, non-refundable donation in the amount you choose. Goes straight to infrastructure (servers + AI). Donating doesn't change your daily cap; subscribe for that.",
    cta: "Upgrade to Supporter",
    donateCta: "Donate what you can",
    footnote:
      "Payment via Stripe Checkout. We never store card numbers. Monthly subscription, auto-renews; cancel anytime from the billing portal.",
    signedOut: "Sign in to Clara to subscribe or donate.",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const copy = COPY[lang];
  return buildMetadata({
    title: copy.metaTitle,
    description: copy.metaDescription,
    path: `/${lang}/upgrade`,
    locale: lang,
    pathByLocale: { es: "/es/upgrade", en: "/en/upgrade" },
  });
}

export function generateStaticParams() {
  return [{ lang: "es" }, { lang: "en" }];
}

/**
 * Public marketing page for the Supporter tier. Linked from the WhatsApp
 * fallback message and from external channels. Hidden (404) when the
 * upsell isn't active globally so we don't dangle a marketing page that
 * leads nowhere.
 */
export default async function UpgradePage({ params }: PageProps) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;

  // Global gate (no userId): both Stripe envs and the global flag must be
  // on. Per-user overrides don't apply to a public marketing page.
  const active = await isUpsellActive();
  if (!active) {
    redirect(`/${locale}/faq#supporter`);
  }

  const copy = COPY[locale];
  const monthlyPriceLabel = (SUPPORTER_PRICE_EUR_CENTS / 100).toLocaleString(
    locale === "es" ? "es-AR" : "en-US",
    { style: "currency", currency: "EUR" },
  );

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <header className="mb-10 space-y-3">
        <span className="sticker sticker-lilac">{copy.chip}</span>
        <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">
          {copy.title}
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          {copy.intro}
        </p>
      </header>

      <section className="surface-card mb-6 space-y-4 p-6">
        <div>
          <p className="text-2xl font-semibold">
            {monthlyPriceLabel}
            <span className="text-muted-foreground text-base font-normal">
              {locale === "es" ? " / mes" : " / month"}
            </span>
          </p>
          <p className="text-muted-foreground text-sm">
            {locale === "es"
              ? `${SUPPORTER_DAILY_LIMIT} consultas diarias con Clara`
              : `${SUPPORTER_DAILY_LIMIT} Clara queries per day`}
          </p>
        </div>
        <ul className="text-muted-foreground space-y-2 text-sm">
          {copy.benefits.map((b) => (
            <li key={b}>· {b}</li>
          ))}
        </ul>
        <Link
          href="/app?upgrade=subscription"
          className="bg-foreground text-background inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold"
        >
          {copy.cta}
        </Link>
      </section>

      <section className="surface-card mb-6 space-y-3 p-6">
        <h2 className="font-display text-xl font-semibold">
          {copy.donateTitle}
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {copy.donateBody}
        </p>
        <Link
          href="/app?upgrade=donation"
          className="border-foreground/20 hover:bg-foreground/5 inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-semibold"
        >
          {copy.donateCta}
        </Link>
      </section>

      <p className="text-muted-foreground text-xs leading-relaxed">
        {copy.footnote}
      </p>
    </article>
  );
}
