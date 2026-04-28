import type { Metadata } from "next";
import Link from "next/link";

import { FEATURES } from "@/lib/marketing-content";
import {
  breadcrumbJsonLd,
  buildMetadata,
  jsonLdScript,
  softwareApplicationJsonLd,
} from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Features",
  description:
    "Todo lo que Clara puede hacer: leer extractos PDF/CSV, transcribir notas de voz por WhatsApp, sincronizarse con tu banco vía Open Banking, planificar mes a mes y exponer un servidor MCP para tu propio AI assistant.",
  path: "/features",
});

const SECTIONS = [
  {
    id: "chat",
    title: "Chat-first, multimodal",
    body: [
      "Clara es una conversación, no un formulario. Le mandás texto, una foto del banco, un PDF, un CSV o una nota de voz, y entiende.",
      "Bajo el capó usa Vercel AI SDK v6 con AI Gateway: modelos multimodales para leer imágenes y PDFs, Whisper para transcripción de voz, OpenAI TTS para responder en audio cuando hablás por WhatsApp.",
      "Antes de tocar tu base de datos siempre te muestra una propuesta y pide confirmación. Clara nunca toca tu plata sin permiso explícito.",
    ],
  },
  {
    id: "month",
    title: "Organizada por mes, con plantillas",
    body: [
      "Cada gasto recurrente vive como una plantilla (Expense). Cada mes tiene su copia (MonthExpenseLine) que tildás cuando lo pagás. Si un mes hay un gasto puntual, lo agregás solo a ese mes.",
      "Esto te da algo que las planillas planas no te dan: un historial mes a mes que sabe distinguir entre lo recurrente y lo puntual, con balance independiente en cada uno.",
    ],
  },
  {
    id: "banking",
    title: "Open Banking + multi-banco",
    body: [
      "Conexión automática de solo lectura con Open Banking: sincronizás tu Revolut o cualquier banco europeo, y Clara matchea las transacciones contra tus plantillas planificadas. Clara nunca tiene acceso a tu dinero.",
      "Cada gasto sabe en qué banco vive. Útil cuando repartís el alquiler entre tres cuentas y querés saber cuánto te queda en cada una.",
    ],
  },
  {
    id: "whatsapp",
    title: "WhatsApp como inbox principal",
    body: [
      "Linkeás tu número desde Settings y mandás notas de voz, fotos o texto a Clara por WhatsApp. Clara transcribe la voz, clasifica el gasto y responde en audio.",
      "Es el modo más rápido de registrar un gasto: caminás, mandás “pagué la luz $120”, y queda registrado.",
    ],
  },
  {
    id: "mcp",
    title: "MCP para tu propio AI assistant",
    body: [
      "Clara expone dos servidores MCP (Model Context Protocol):",
      "• `/api/mcp` — Público, sin auth. Tu AI assistant puede consultar features, FAQ y docs de Clara para responder preguntas “qué es Clara”, “cómo procesa PDFs”, etc.",
      "• `/api/mcp/user` — Autenticado por bearer token (lo generás desde Settings → Acceso para AI). Tu AI puede listar tus meses, consultar balance, agregar gastos, marcar como pagado — siempre con el alcance de tu token.",
      "Funciona out-of-the-box con Claude Desktop, Cursor, ChatGPT (custom GPTs) y cualquier cliente MCP compatible.",
    ],
  },
  {
    id: "self-hostable",
    title: "Open source, MIT, self-hostable",
    body: [
      "Stack: Next.js 16 (App Router) + Postgres + Prisma 7 + Vercel AI SDK v6. Optimizada para Vercel pero corre en cualquier Node.js 24.",
      "Cloneás el repo, configurás .env, corrés `npm run prisma:migrate` y `vercel deploy` — listo. La guía completa está en el README.",
      "No hay telemetría ni tracking. Tus datos viven donde vos los pongas.",
    ],
  },
];

export default function FeaturesPage() {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <script
        {...jsonLdScript([
          softwareApplicationJsonLd(),
          breadcrumbJsonLd([
            { name: "Inicio", path: "/" },
            { name: "Features", path: "/features" },
          ]),
        ])}
      />

      <header className="mb-12 space-y-4">
        <span className="sticker sticker-lime">Features</span>
        <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">
          Todo lo que hace Clara,
          <br />
          <span className="relative inline-block">
            <span className="bg-lime/60 absolute inset-x-[-0.05em] bottom-1 -z-10 h-3 rounded-sm" aria-hidden />
            sin marketing-speak.
          </span>
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          Las features están agrupadas por superficie. Cada una tiene un para qué claro: hacer
          que entender tu plata sea conversacional, no operativo.
        </p>
      </header>

      <ul className="grid gap-3 pb-10 sm:grid-cols-2">
        {FEATURES.map(({ emoji, title, description }) => (
          <li key={title} className="surface-card flex gap-4 p-4">
            <span className="text-2xl" aria-hidden>
              {emoji}
            </span>
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="space-y-12">
        {SECTIONS.map(({ id, title, body }) => (
          <section key={id} id={id} className="space-y-4">
            <h2 className="font-display text-2xl font-bold">{title}</h2>
            {body.map((paragraph, idx) => (
              <p key={idx} className="text-muted-foreground leading-relaxed">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>

      <div className="border-border/40 mt-16 flex flex-wrap gap-3 border-t pt-10">
        <Link
          href="/register"
          className="bg-foreground text-background hover:bg-foreground/90 inline-flex h-11 items-center rounded-full px-5 text-sm font-semibold shadow-sm transition-colors"
        >
          Empezar gratis
        </Link>
        <Link
          href="/faq"
          className="border-border hover:bg-muted inline-flex h-11 items-center rounded-full border px-5 text-sm font-medium transition-colors"
        >
          Ver FAQ
        </Link>
        <Link
          href="https://github.com/kyberis/etracker"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex h-11 items-center px-3 text-sm font-medium transition-colors"
        >
          Código en GitHub →
        </Link>
      </div>
    </article>
  );
}
