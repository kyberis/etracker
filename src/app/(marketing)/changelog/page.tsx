import type { Metadata } from "next";

import { CHANGELOG } from "@/lib/marketing-content";
import {
  breadcrumbJsonLd,
  buildMetadata,
  getSiteUrl,
  jsonLdScript,
  ORG_LEGAL_NAME,
  ORG_URL,
} from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Changelog",
  description:
    "Historial de cambios de Clara: nuevas features, mejoras, fixes. Versionado siguiendo SemVer.",
  path: "/changelog",
});

export default function ChangelogPage() {
  const site = getSiteUrl();
  const articles = CHANGELOG.map((entry) => ({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${entry.version} — ${entry.title}`,
    datePublished: entry.date,
    dateModified: entry.date,
    author: { "@type": "Organization", name: ORG_LEGAL_NAME, url: ORG_URL },
    publisher: { "@type": "Organization", name: ORG_LEGAL_NAME, url: ORG_URL },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${site}/changelog` },
    description: entry.highlights.join(" "),
  }));

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <script
        {...jsonLdScript([
          breadcrumbJsonLd([
            { name: "Inicio", path: "/" },
            { name: "Changelog", path: "/changelog" },
          ]),
          ...articles,
        ])}
      />

      <header className="mb-10 space-y-3">
        <span className="sticker sticker-lime">Changelog</span>
        <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">
          Historia de Clara
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          Releases públicas con SemVer. Sin marketing-fluff: qué se agregó, qué cambió, qué se
          arregló.
        </p>
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
                {entry.date}
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
