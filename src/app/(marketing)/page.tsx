import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import {
  ELEVATOR_PITCH,
  FAQ,
  FEATURES,
  HERO_PITCH,
} from "@/lib/marketing-content";
import {
  buildMetadata,
  faqJsonLd,
  jsonLdScript,
  softwareApplicationJsonLd,
} from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Clara — tu asistente financiera con IA",
  description:
    "Tu money coach con IA. Chateá con tu plata: PDFs, notas de voz, Open Banking. Open source MIT, self-hostable, con servidor MCP para integrar con Claude, ChatGPT y Cursor.",
  path: "/",
});

const FEATURE_STICKER_VARIANTS = [
  "sticker-lime",
  "sticker-pink",
  "sticker-violet",
  "sticker-peach",
] as const;

export default function LandingPage() {
  return (
    <>
      <script
        {...jsonLdScript([
          softwareApplicationJsonLd(),
          faqJsonLd(FAQ.slice(0, 6)),
        ])}
      />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto w-full max-w-6xl px-4 pt-14 pb-12 sm:px-6 sm:pt-20 sm:pb-16">
          <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_1fr]">
            {/* Hero copy */}
            <div className="space-y-7">
              <span className="sticker sticker-lime">
                Money coach con IA · Open Source · MIT
              </span>
              <h1 className="display text-foreground text-4xl leading-[1.02] sm:text-5xl lg:text-6xl">
                Tu plata,
                <br />
                finalmente <span className="hl">Clara</span>.
              </h1>
              <p className="text-foreground/80 max-w-xl text-lg leading-relaxed">
                {HERO_PITCH}
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <Link
                  href="/register"
                  className="bg-foreground text-background hover:bg-foreground/90 inline-flex h-12 items-center gap-2 rounded-full px-6 text-base font-semibold shadow-sm transition-colors"
                >
                  Empezar gratis
                  <span aria-hidden>→</span>
                </Link>
                <Link
                  href="/features"
                  className="surface-card inline-flex h-12 items-center rounded-full px-6 text-base font-semibold transition-transform hover:scale-[1.01]"
                >
                  Ver qué hace
                </Link>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="sticker sticker-soft">Sin tarjeta</span>
                <span className="sticker sticker-soft">Sin telemetría</span>
                <span className="sticker sticker-soft">Self-hosteable</span>
              </div>
            </div>

            {/* Hero chat preview */}
            <div className="relative">
              {/* Floating balance pill */}
              <div className="absolute -top-5 -left-2 z-20 sm:-left-4">
                <div className="ink-card flex items-center gap-3 rounded-full px-4 py-2.5">
                  <div className="leading-none">
                    <p className="text-lime text-[9px] font-bold tracking-[0.22em] uppercase">
                      balance · abr &apos;26
                    </p>
                    <p className="num mt-0.5 text-2xl text-white">
                      USD 1.284
                      <span className="text-base text-white/50">.50</span>
                    </p>
                  </div>
                  <span className="sticker sticker-lime">+12%</span>
                </div>
              </div>

              <div className="surface-card relative space-y-4 p-6 pt-10 sm:p-7 sm:pt-12">
                <div className="flex items-center gap-3">
                  <Image
                    src="/clara-avatar-simple.png"
                    alt="Clara"
                    width={56}
                    height={56}
                    priority
                    className="avatar-clara size-14 shrink-0"
                  />
                  <div>
                    <p className="display text-foreground text-base font-bold">
                      Clara
                    </p>
                    <p className="text-muted-foreground text-xs">
                      en línea · habla rioplatense
                    </p>
                  </div>
                  <span className="sticker sticker-violet ml-auto">conciso</span>
                </div>

                <div className="space-y-3 pt-1">
                  <div className="flex justify-end">
                    <div className="bubble-user max-w-[85%] px-4 py-2.5 text-sm">
                      Pagué el alquiler hoy, $850
                    </div>
                  </div>

                  <div className="flex items-end gap-2.5">
                    <Image
                      src="/clara-avatar-simple.png"
                      alt=""
                      width={40}
                      height={40}
                      aria-hidden
                      className="avatar-clara size-10 shrink-0"
                    />
                    <div className="bubble-clara max-w-[85%] space-y-2 px-4 py-3">
                      <p className="text-sm leading-snug">
                        Listo, marqué <strong>Alquiler</strong> como pagado en
                        abril ✅. Te quedan{" "}
                        <strong className="text-lime-deep">USD 1.240</strong>{" "}
                        para los pendientes del mes.
                      </p>
                      <div className="surface-soft flex items-center justify-between rounded-2xl px-3 py-2 text-xs">
                        <span className="text-foreground/80 font-medium">
                          Alquiler · vivienda · Galicia
                        </span>
                        <span className="num text-foreground font-bold">
                          USD 850
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <div className="bubble-user max-w-[85%] px-4 py-2.5 text-sm">
                      Tirame un PDF del banco
                    </div>
                  </div>

                  <div className="flex items-end gap-2.5">
                    <Image
                      src="/clara-avatar-simple.png"
                      alt=""
                      width={40}
                      height={40}
                      aria-hidden
                      className="avatar-clara size-10 shrink-0 opacity-60"
                    />
                    <div className="bubble-clara flex items-center gap-1.5 px-4 py-3">
                      <span className="bg-lime-deep size-1.5 animate-pulse rounded-full" />
                      <span
                        className="bg-lime-deep size-1.5 animate-pulse rounded-full"
                        style={{ animationDelay: "0.15s" }}
                      />
                      <span
                        className="bg-lime-deep size-1.5 animate-pulse rounded-full"
                        style={{ animationDelay: "0.3s" }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute -right-1 -bottom-3 sm:right-2">
                <span className="sticker sticker-pink">+ MCP-ready</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats row */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-6 sm:pb-16">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="surface-card p-5">
            <p className="text-muted-foreground text-[10px] font-bold tracking-[0.2em] uppercase">
              Ingreso
            </p>
            <p className="num text-foreground mt-1 text-3xl">3.200</p>
            <p className="text-muted-foreground mt-1 text-xs">USD · abril</p>
          </div>
          <div className="surface-card p-5">
            <p className="text-muted-foreground text-[10px] font-bold tracking-[0.2em] uppercase">
              Planificado
            </p>
            <p className="num text-hotpink mt-1 text-3xl">1.915</p>
            <p className="text-muted-foreground mt-1 text-xs">7 plantillas</p>
          </div>
          <div className="surface-card p-5">
            <p className="text-muted-foreground text-[10px] font-bold tracking-[0.2em] uppercase">
              Pagado
            </p>
            <p className="num text-foreground mt-1 text-3xl">1.500</p>
            <p className="text-lime-deep mt-1 text-xs font-bold">+200 hoy</p>
          </div>
          <div className="surface-card relative p-5">
            <p className="text-muted-foreground text-[10px] font-bold tracking-[0.2em] uppercase">
              Pendiente
            </p>
            <p className="num text-foreground mt-1 text-3xl">415</p>
            <span className="sticker sticker-peach absolute top-3 right-3">
              2 ítems
            </span>
          </div>
        </div>
      </section>

      {/* Editorial pitch */}
      <section className="px-4 pb-12 sm:px-6 sm:pb-16">
        <div className="mx-auto max-w-3xl space-y-5 text-center">
          <div className="squiggle mx-auto w-32" aria-hidden />
          <h2 className="display text-foreground text-3xl leading-tight sm:text-5xl">
            Una <span className="hl hl-pink">asistente</span>,
            <br />
            no una planilla.
          </h2>
          <p className="text-foreground/80 mx-auto max-w-2xl text-lg leading-relaxed">
            {ELEVATOR_PITCH} Cada feature está pensada para que entiendas tu
            plata sin abrir Excel — y para que tu propio AI te ayude sin
            pedirte permiso quince veces.
          </p>
        </div>
      </section>

      {/* Features grid */}
      <section
        id="features"
        className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6"
      >
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ emoji, title, description }, idx) => {
            const variant =
              FEATURE_STICKER_VARIANTS[idx % FEATURE_STICKER_VARIANTS.length];
            return (
              <li
                key={title}
                className="surface-card flex flex-col gap-3 p-6"
              >
                <span className={`sticker ${variant} self-start`}>
                  <span aria-hidden className="not-sr-only">
                    {emoji}
                  </span>
                  <span>{title}</span>
                </span>
                <p className="text-foreground/80 text-sm leading-relaxed">
                  {description}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* MCP callout */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
        <div className="ink-card ink-glow grid items-center gap-8 p-8 text-white/90 sm:p-10 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <span className="sticker sticker-lime">MCP-ready</span>
            <h2 className="display text-3xl leading-tight text-white sm:text-4xl">
              Tu propio AI puede
              <br />
              <span className="hl hl-violet">hablar con Clara</span>.
            </h2>
            <p className="max-w-xl leading-relaxed text-white/75">
              Clara expone un servidor MCP (Model Context Protocol). Generás un
              token desde Settings y lo pegás en Claude Desktop, Cursor o
              cualquier cliente compatible: tu asistente consulta tus meses,
              mira el balance y registra gastos con tu permiso.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/features#mcp"
                className="bg-lime hover:bg-lime/90 text-foreground inline-flex h-11 items-center rounded-full px-5 text-sm font-bold transition-colors"
              >
                Cómo conectarlo
              </Link>
              <Link
                href="/api/mcp"
                className="inline-flex h-11 items-center rounded-full border border-white/30 px-5 text-sm font-medium transition-colors hover:bg-white/10"
              >
                MCP público
              </Link>
            </div>
          </div>
          <pre className="overflow-x-auto rounded-2xl bg-black/40 p-5 text-xs leading-relaxed text-white/80 sm:text-sm">
            <code>{`# Claude Desktop / Cursor mcp.json
{
  "mcpServers": {
    "clara": {
      "url": "https://ada.trefolio.com/api/mcp/user",
      "headers": {
        "Authorization": "Bearer <ada_pat_…>"
      }
    }
  }
}`}</code>
          </pre>
        </div>
      </section>

      {/* Editorial quote / rule */}
      <section className="px-4 pb-16 sm:px-6">
        <div className="surface-card relative mx-auto max-w-4xl overflow-hidden p-10 text-center sm:p-14">
          <span className="sticker sticker-pink mb-4 inline-block">
            menos drama
          </span>
          <h2 className="display text-foreground text-3xl leading-tight sm:text-4xl">
            La regla de Clara:
            <br />
            <span className="hl hl-peach">menos planilla, más decisiones</span>.
          </h2>
          <p className="text-foreground/80 mx-auto mt-4 max-w-2xl leading-relaxed">
            Solo las plantillas recurrentes nacen pendientes. Lo que cargues en
            el mes — por chat, voz o foto — se marca como pagado por defecto.
            Vos te enfocás en decidir, Clara se ocupa del resto.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto w-full max-w-3xl px-4 pb-24 text-center sm:px-6">
        <h2 className="display text-foreground text-4xl leading-tight sm:text-5xl">
          Tu plata <span className="hl">clara</span>,
          <br />
          en cinco minutos.
        </h2>
        <p className="text-foreground/80 mx-auto mt-4 max-w-xl text-lg">
          Creás cuenta, conectás (opcional) tu banco o WhatsApp, y Clara se
          hace cargo del resto.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/register"
            className="bg-foreground text-background hover:bg-foreground/90 inline-flex h-12 items-center gap-2 rounded-full px-6 text-base font-semibold shadow-sm transition-colors"
          >
            Empezar gratis
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/faq"
            className="surface-card inline-flex h-12 items-center rounded-full px-6 text-base font-semibold transition-transform hover:scale-[1.01]"
          >
            Resolver dudas
          </Link>
        </div>
      </section>
    </>
  );
}
