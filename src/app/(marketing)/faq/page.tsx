import type { Metadata } from "next";

import { FAQ } from "@/lib/marketing-content";
import {
  breadcrumbJsonLd,
  buildMetadata,
  faqJsonLd,
  jsonLdScript,
} from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Preguntas frecuentes",
  description:
    "Todo lo que querés saber sobre Clara: cómo procesa PDFs, qué bancos soporta, privacidad, costo, cómo conectarla a Claude/Cursor/ChatGPT vía MCP, y self-hosting.",
  path: "/faq",
});

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function FaqPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const filtered = q
    ? FAQ.filter(
        (entry) =>
          entry.question.toLowerCase().includes(q) ||
          entry.answer.toLowerCase().includes(q),
      )
    : FAQ;

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <script
        {...jsonLdScript([
          faqJsonLd(FAQ),
          breadcrumbJsonLd([
            { name: "Inicio", path: "/" },
            { name: "FAQ", path: "/faq" },
          ]),
        ])}
      />

      <header className="mb-10 space-y-3">
        <span className="sticker sticker-lime">FAQ</span>
        <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">
          Preguntas frecuentes
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          Las dudas más comunes sobre cómo funciona Clara, qué hace con tus datos y cómo
          integrarla con tu propio AI assistant.
        </p>
      </header>

      {q && filtered.length === 0 ? (
        <p className="text-muted-foreground">
          No encontramos preguntas que matcheen “{q}”.
        </p>
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
