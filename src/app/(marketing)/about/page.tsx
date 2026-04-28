import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { FEATURES } from "@/lib/marketing-content";
import {
  breadcrumbJsonLd,
  buildMetadata,
  jsonLdScript,
} from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Sobre Clara",
  description:
    "Por qué Clara: una asistente financiera con IA pensada alrededor de la claridad. Open source MIT, hecha por Trefolio para gente que quiere entender en qué se le va la plata sin pelearse con planillas.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <article className="mx-auto w-full max-w-2xl space-y-14 px-4 py-12 sm:px-6">
      <script
        {...jsonLdScript([
          breadcrumbJsonLd([
            { name: "Inicio", path: "/" },
            { name: "Sobre Clara", path: "/about" },
          ]),
        ])}
      />

      {/* Hero */}
      <header className="space-y-5">
        <span className="sticker sticker-lime">Asistente financiera con IA</span>
        <h1 className="display text-foreground text-4xl leading-tight sm:text-5xl">
          Hola, soy <span className="hl">Clara</span>.
          <br />
          Tu plata, finalmente clara.
        </h1>
        <p className="text-foreground/80 max-w-prose text-lg leading-relaxed">
          Una asistente financiera con IA. Entiendo extractos bancarios, notas
          de voz, PDFs y preguntas en castellano normal. No soy una planilla
          con mejor diseño — soy alguien con quien podés hablar de tu guita
          sin vergüenza.
        </p>
      </header>

      {/* Por qué Clara — el concepto de claridad */}
      <section className="space-y-5">
        <span className="sticker sticker-pink">Por qué Clara</span>
        <h2 className="display text-foreground text-2xl sm:text-3xl">
          La idea es la <span className="hl hl-peach">claridad</span>.
        </h2>
        <div className="space-y-4 text-foreground/80 leading-relaxed">
          <p>
            La mayoría de las apps de finanzas hacen lo opuesto a lo que
            decían que iban a hacer: te muestran filas, gráficos de torta,
            categorías que vos no creaste, banners de upsell — y al final del
            mes seguís sin saber a dónde se fueron 400 dólares.
          </p>
          <p>
            <strong className="text-foreground">Clara</strong> existe para
            invertir esa lógica. La pregunta que guía el producto no es
            &quot;¿cómo te muestro más datos?&quot;, es{" "}
            <em className="text-foreground">¿qué tenés que entender hoy?</em>.
            De ahí el nombre. Clara{" "}
            <span className="hl hl-violet">aclara</span>: traduce extractos a
            decisiones, voz a registros, fotos a categorías. El piso siempre
            es entender, no acumular.
          </p>
          <p>
            Hablás con Clara como hablás con cualquiera. Le mandás un PDF y
            entiende. Una nota de voz por WhatsApp y registra el gasto.
            Conectás Open Banking y matchea movimientos contra tus plantillas
            sin que vos toques nada. <strong>Less drama, more done.</strong>
          </p>
        </div>
      </section>

      {/* Cómo nació */}
      <section className="space-y-5">
        <span className="sticker sticker-violet">Cómo nació</span>
        <h2 className="display text-foreground text-2xl sm:text-3xl">
          Construida por gente que tampoco entendía a dónde iba la plata.
        </h2>

        <div className="surface-card space-y-4 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="sticker sticker-soft">trefolio.com</span>
            <span className="text-muted-foreground text-xs">
              → los que construyeron Clara
            </span>
          </div>
          <p className="text-foreground/80 text-sm leading-relaxed">
            Somos el equipo detrás de{" "}
            <Link
              href="https://trefolio.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground decoration-lime decoration-[3px] underline-offset-4 hover:underline"
            >
              trefolio.com
              <ExternalLink className="ml-0.5 inline size-3 align-baseline" />
            </Link>
            , una plataforma de portfolios para profesionales tech. Ganamos
            bien. Y tampoco entendíamos a dónde iba la plata.
          </p>
          <p className="text-foreground/80 text-sm leading-relaxed">
            Probamos apps de finanzas — todas eran planillas glorificadas,
            jardines cerrados con suscripciones caras, o simplemente no
            hablaban nuestro idioma (literal y figuradamente). Las que tenían
            IA la usaban como feature de marketing, no como núcleo del
            producto.
          </p>
          <p className="text-foreground/80 text-sm leading-relaxed">
            Así que construimos la nuestra. Queríamos algo que leyera un PDF
            del banco, escuchara una nota de voz de WhatsApp, se sincronizara
            con Revolut, y respondiera en rioplatense sin sonar a chatbot
            corporativo. Una asistente de verdad — no un formulario con IA
            encima.
          </p>
          <p className="text-foreground/80 text-sm leading-relaxed">
            La llamamos <strong className="text-foreground">Clara</strong>{" "}
            porque ese es el norte: que sea claro qué pasa con tu plata. Y la
            hicimos open-source porque creemos que tus finanzas son tuyas —
            ninguna empresa debería tener el monopolio de entenderlas.
          </p>
        </div>
      </section>

      {/* Avatar / personality */}
      <section className="space-y-5">
        <div className="ink-card ink-glow flex items-center gap-5 p-6 text-white/90">
          <Image
            src="/ada-avatar.png"
            alt="Clara"
            width={88}
            height={88}
            className="size-20 shrink-0 rounded-full object-cover ring-2 ring-white/15"
          />
          <div className="space-y-1">
            <p className="display text-base font-bold text-white">Clara</p>
            <p className="text-sm leading-relaxed text-white/75">
              Tu money coach con IA. Habla rioplatense, no juzga, te muestra
              números antes de tomar cualquier acción.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="space-y-5">
        <span className="sticker sticker-lime">Qué puede hacer</span>
        <h2 className="display text-foreground text-2xl sm:text-3xl">
          Todo lo que hace Clara.
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
          <span className="sticker sticker-soft">MIT License</span>
          <span className="sticker sticker-lime">Open Source</span>
        </div>
        <h2 className="display text-foreground text-xl">
          Tu data es tuya, siempre.
        </h2>
        <p className="text-foreground/80 text-sm leading-relaxed">
          Clara no tiene telemetría, no vende datos, no cobra por usuario. El
          código es público, podés hostearlo vos mismo, y si alguna vez
          decidimos cerrar el servicio el repo sigue ahí. Sin excusas.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link
            href="https://github.com/kyberis/etracker"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground decoration-lime decoration-[3px] underline-offset-4 inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            <ExternalLink className="size-3.5" />
            Ver el código en GitHub
          </Link>
          <Link
            href="https://github.com/kyberis/etracker/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm hover:underline"
          >
            <ExternalLink className="size-3.5" />
            Reportar un bug
          </Link>
        </div>
      </section>

      {/* Made by */}
      <section className="flex flex-wrap items-center justify-between gap-4 text-sm">
        <p className="text-muted-foreground">
          Hecho con ☕ y una sana desconfianza de las planillas.
        </p>
        <Link
          href="https://trefolio.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 font-medium transition-colors hover:underline"
        >
          trefolio.com
          <ExternalLink className="size-3.5" />
        </Link>
      </section>
    </article>
  );
}
