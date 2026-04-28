import type { Metadata } from "next";

import { PRIVACY_SECTIONS } from "@/lib/marketing-content";
import {
  breadcrumbJsonLd,
  buildMetadata,
  jsonLdScript,
} from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Privacidad",
  description:
    "Cómo Clara trata tus datos: qué guarda, qué no recolecta, cómo procesa con IA en modo zero data retention, y cómo ejercer tus derechos.",
  path: "/privacy",
});

const LAST_UPDATED = "2026-04-28";

export default function PrivacyPage() {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <script
        {...jsonLdScript([
          breadcrumbJsonLd([
            { name: "Inicio", path: "/" },
            { name: "Privacidad", path: "/privacy" },
          ]),
        ])}
      />

      <header className="mb-10 space-y-3">
        <span className="sticker sticker-lime">Privacidad</span>
        <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">
          Tus datos, tu control.
        </h1>
        <p className="text-muted-foreground">
          Última actualización:{" "}
          <time dateTime={LAST_UPDATED}>{LAST_UPDATED}</time>.
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
          <h2 className="font-display text-2xl font-bold">Contacto</h2>
          <p className="text-muted-foreground leading-relaxed">
            Para cualquier consulta sobre privacidad, abrí un issue en{" "}
            <a
              className="text-foreground decoration-lime decoration-[3px] underline-offset-4 hover:underline"
              href="https://github.com/kyberis/etracker/issues"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/kyberis/etracker/issues
            </a>{" "}
            o contactanos vía{" "}
            <a
              className="text-foreground decoration-lime decoration-[3px] underline-offset-4 hover:underline"
              href="https://trefolio.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              trefolio.com
            </a>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
