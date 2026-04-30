/**
 * Single source of truth for marketing copy used across the public marketing
 * pages, `/llms.txt`, `/llms-full.txt`, and the public MCP server.
 *
 * Keep this file plain data (no JSX) so it can be imported from both Server
 * Components and Edge route handlers.
 */

import type { Locale } from "@/lib/i18n/locale";

export type MarketingFeature = {
  emoji: string;
  title: string;
  description: string;
};

export type MarketingFaq = { question: string; answer: string };

export type ChangelogEntry = {
  version: string;
  date: string;
  title: string;
  highlights: string[];
};

export type PrivacySection = { heading: string; body: string[] };

type LocalisedMarketingContent = {
  HERO_PITCH: string;
  ELEVATOR_PITCH: string;
  FEATURES: MarketingFeature[];
  FAQ: MarketingFaq[];
  CHANGELOG: ChangelogEntry[];
  PRIVACY_SECTIONS: PrivacySection[];
};

const ES: LocalisedMarketingContent = {
  HERO_PITCH:
    "Hablale en castellano, mandale el PDF del banco, dictale una nota de voz por WhatsApp. Clara entiende, categoriza y mantiene tu balance al día. Less drama, more done.",
  ELEVATOR_PITCH:
    "Chat-first expense tracker con personalidad. Open source, MIT, self-hostable. Sin telemetría, sin precio por usuario, hablando rioplatense.",
  FEATURES: [
    {
      emoji: "🤖",
      title: "Lee tus extractos",
      description:
        "Tirá una captura del banco, un PDF o un CSV. Clara extrae los movimientos, sugiere categorías y siempre pregunta antes de tocar nada.",
    },
    {
      emoji: "🎙️",
      title: "Escucha notas de voz",
      description:
        "“Pagué el alquiler” por WhatsApp es suficiente. Clara transcribe, clasifica y actualiza el mes sin que abras la app.",
    },
    {
      emoji: "🔄",
      title: "Se sincroniza con tu banco",
      description:
        "Open Banking con solo lectura. Conectás tu banco una vez, sincronizás por mes, y Clara matchea transacciones con tus gastos planificados. Clara nunca tiene acceso a tu dinero.",
    },
    {
      emoji: "📅",
      title: "Organizada por mes",
      description:
        "Una plantilla define un gasto recurrente. Cada mes tiene su copia independiente que tildás cuando lo pagás.",
    },
    {
      emoji: "🏦",
      title: "Multi-banco real",
      description:
        "Cada gasto sabe en qué banco vive. Útil cuando repartís el alquiler entre tres cuentas y querés saber cuánto te queda en cada una.",
    },
    {
      emoji: "📊",
      title: "Visualiza solo cuando ayuda",
      description:
        "Clara no tira gráficos por tirar. Los renderiza inline solo cuando suman para entender lo que está pasando.",
    },
    {
      emoji: "💬",
      title: "Habla en rioplatense",
      description:
        "Sin inglés corporativo ni tuteo. Clara habla como una amiga contadora que sabe lo que hace — sin sermones, prometido.",
    },
    {
      emoji: "🔓",
      title: "Tu data es tuya",
      description:
        "Open source MIT. Self-hosteable en cualquier Vercel/Postgres. Sin telemetría, sin tracking, sin upsell de IA a $9.99/mes.",
    },
    {
      emoji: "🤝",
      title: "MCP para tu AI",
      description:
        "Clara expone un servidor MCP (Model Context Protocol). Conectalo a Claude Desktop, Cursor o ChatGPT y tu propio asistente puede consultar y actualizar tus finanzas con tu permiso.",
    },
  ],
  FAQ: [
    {
      question: "¿Qué es Clara?",
      answer:
        "Clara es una asistente financiera con IA: un expense tracker conversacional que entiende fotos del banco, PDFs, CSVs y notas de voz por WhatsApp. Te ayuda a planificar tus gastos mes a mes, conectarte a tu banco vía Open Banking y mantener tu balance al día.",
    },
    {
      question: "¿Cuánto cuesta?",
      answer:
        "Clara es open source bajo licencia MIT y se puede self-hostear gratis. La versión hosteada por nosotros incluye 30 consultas diarias con la asistente sin pagar nada. Si te queda corto y querés ayudar a mantener la infraestructura, podés subirte al plan Supporter por €7,99 al mes (200 consultas diarias) o hacer un aporte único por el monto que quieras desde el chat. Donación y suscripción son opcionales: el producto sigue siendo gratis para la mayoría de la gente.",
    },
    {
      question: "¿Cómo procesa los PDFs y extractos bancarios?",
      answer:
        "Clara usa modelos de lenguaje multimodales vía Vercel AI Gateway para extraer movimientos de PDFs, capturas y CSVs. El procesamiento corre en Vercel Functions: el archivo se sube a Vercel Blob temporalmente, el modelo extrae los datos, y Clara te muestra una propuesta antes de guardar nada en tu base de datos.",
    },
    {
      question: "¿Qué bancos soporta?",
      answer:
        "Para conexión automática (Open Banking) Clara soporta la mayoría de bancos europeos y del Reino Unido. La conexión es de solo lectura: Clara nunca tiene acceso a tu dinero, solo lee los movimientos. Para cualquier banco del mundo podés importar PDFs/CSVs o registrar gastos manualmente vía chat o nota de voz.",
    },
    {
      question: "¿Cómo funciona la integración con WhatsApp?",
      answer:
        "Linkeás tu número desde Configuración (te llega un código por WhatsApp). Después podés mandarle a Clara notas de voz, fotos o texto: ella transcribe, clasifica el gasto y te confirma antes de actualizar el mes.",
    },
    {
      question: "¿Qué hace con mis datos?",
      answer:
        "Tus datos viven en tu base de datos Postgres (la nuestra si usás la versión hosteada, la tuya si self-hosteás). No hay telemetría, no se venden datos, no se entrenan modelos con tu información. Para LLM usamos Vercel AI Gateway en modo zero data retention.",
    },
    {
      question: "¿En qué idiomas funciona?",
      answer:
        "Clara funciona en español rioplatense (default) e inglés. Podés cambiar el idioma desde el menú o pidiéndoselo a Clara directamente en el chat. La UI completa, las páginas públicas y el agente respetan la elección.",
    },
    {
      question: "¿Puedo usar Clara con mi propio AI assistant (Claude, Cursor, ChatGPT)?",
      answer:
        "Sí. Clara expone un servidor MCP (Model Context Protocol) en /api/mcp/user. Generás un token desde Configuración → Acceso para AI, lo pegás en Claude Desktop, Cursor o cualquier cliente MCP, y tu asistente puede listar tus meses, consultar balance, agregar gastos y marcar como pagado — siempre con tu permiso.",
    },
    {
      question: "¿Es self-hostable?",
      answer:
        "Sí. El stack es Next.js 16 + Postgres + Prisma + Vercel AI SDK. Cloneás el repo, configurás .env (DATABASE_URL, NEXTAUTH_SECRET, AI_GATEWAY_API_KEY), corrés las migraciones, y deployás a Vercel con un click. La guía completa está en el README.",
    },
    {
      question: "¿Cómo se compara con otras apps de finanzas?",
      answer:
        "Mint, YNAB, Fintonic y similares son planillas con mejor diseño: filas, categorías y reportes. Clara es chat-first: hablás con ella en lenguaje normal, le mandás un PDF y entiende, le mandás una nota de voz y registra el gasto. La IA es el núcleo del producto, no una feature de marketing. Y es open source.",
    },
  ],
  CHANGELOG: [
    {
      version: "0.3.1",
      date: "2026-04-30",
      title: "Gráficos en WhatsApp y respuestas con formato en Telegram",
      highlights: [
        "Cuando el agente llama a renderChart, Clara arma URLs PNG (QuickChart) y las manda antes del texto por WhatsApp (Twilio) y por Telegram.",
        "En Telegram las respuestas del agente usan HTML seguro: las **negritas** del modelo se ven bien sin Markdown crudo.",
        "Podés desactivar las imágenes salientes con CLARA_OUTBOUND_CHART_IMAGES=0 o usar QuickChart self-hosted con CLARA_QUICKCHART_BASE_URL.",
      ],
    },
    {
      version: "0.3.0",
      date: "2026-04-30",
      title: "Clara también en Telegram",
      highlights: [
        "Vinculá Telegram desde Configuración → Integraciones: abrimos el bot con un enlace `t.me` y un código corto guardado en tu cuenta (Telegram solo acepta hasta 64 caracteres en `?start=`).",
        "Mismo cerebro que la web: la IA, las herramientas y el cupo diario son compartidos entre web, WhatsApp y Telegram. Mandá fotos del banco, notas de voz o texto, y Clara responde en castellano rioplatense o inglés según tu idioma.",
        "Los chats privados quedan listos hoy. Soporte de grupos (con menciones tipo `@clara`) llega pronto.",
        "Si antes el bot no reaccionaba al tocar Iniciar, era por ese límite: ahora el flujo de vinculación usa un código que sí entra en el enlace profundo.",
      ],
    },
    {
      version: "0.2.0",
      date: "2026-04-30",
      title: "Plan Supporter y donaciones",
      highlights: [
        "Cuando llegás al límite diario con Clara aparece un modal con dos opciones: donar lo que puedas (aporte único) o subir al plan Supporter por €7,99 al mes para llevar las consultas a 200 diarias.",
        "Pagos vía Stripe Checkout. El número de tarjeta nunca pasa por Clara. Cancelás la suscripción cuando quieras desde Configuración → Suscripción.",
        "Self-hosting sigue 100% gratis. La página de upgrade y el modal solo aparecen cuando un admin habilita la feature flag `quota_upsell` y las claves de Stripe están configuradas.",
      ],
    },
    {
      version: "0.1.1",
      date: "2026-04-30",
      title: "Negritas legibles en WhatsApp",
      highlights: [
        "Las respuestas del agente usaban **negritas** estilo Markdown; WhatsApp espera *una sola* asterisco. Ahora convertimos el formato al enviar, así los totales se ven en negrita en lugar de asteriscos sueltos.",
      ],
    },
    {
      version: "0.1.0",
      date: "2026-04-28",
      title: "Apertura pública de Clara",
      highlights: [
        "Landing pública con SEO completo y soporte para AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended).",
        "Servidor MCP público en /api/mcp para que AI assistants conozcan Clara.",
        "Servidor MCP autenticado por usuario en /api/mcp/user con tokens MCP gestionados desde Configuración.",
        "llms.txt y llms-full.txt para descubrimiento por LLMs.",
      ],
    },
    {
      version: "0.0.9",
      date: "2026-04-15",
      title: "Open Banking con Revolut",
      highlights: [
        "Conexión automática de solo lectura con bancos europeos vía Open Banking.",
        "Sincronización por mes y matching contra plantillas planificadas.",
        "UI nueva en Configuración para conectar/desconectar y configurar el banco por defecto.",
      ],
    },
    {
      version: "0.0.8",
      date: "2026-04-01",
      title: "WhatsApp como inbox principal",
      highlights: [
        "Notas de voz transcritas por Whisper y clasificadas por el agente.",
        "Respuestas en audio vía OpenAI TTS subidas a Vercel Blob.",
        "Linking de número vía código de un solo uso desde Configuración.",
      ],
    },
  ],
  PRIVACY_SECTIONS: [
    {
      heading: "Qué datos recolecta Clara",
      body: [
        "Clara solo guarda lo necesario para funcionar como tracker de gastos: tu email, los bancos que registres, las plantillas y líneas de gasto que crees, los movimientos que sincronices vía Open Banking y, opcionalmente, tu número de WhatsApp para recibir notas por ese canal.",
        "Si usás la versión hosteada por Trefolio, los datos viven en una base Postgres administrada en Europa. Si self-hosteás, viven donde vos los pongas.",
      ],
    },
    {
      heading: "Qué NO hace Clara",
      body: [
        "No tiene telemetría: no medimos clicks, sesiones ni eventos de uso para analytics.",
        "No vende datos a terceros y no monetiza tu información.",
        "No entrena modelos con tu información: usamos Vercel AI Gateway con zero data retention para todas las llamadas LLM.",
        "Nunca tiene acceso a tu dinero: la conexión bancaria vía Open Banking es estrictamente de solo lectura.",
      ],
    },
    {
      heading: "Procesamiento por IA",
      body: [
        "Para entender tus mensajes, transcribir voz y procesar PDFs, Clara manda contenido a modelos de lenguaje a través de Vercel AI Gateway. Esos providers operan bajo políticas zero data retention: el contenido se procesa y se descarta, no se usa para entrenamiento.",
        "Los archivos que subís (PDFs, capturas) se almacenan en Vercel Blob el tiempo necesario para procesarlos y se borran después.",
      ],
    },
    {
      heading: "Pagos (Supporter y donaciones)",
      body: [
        "Si elegís suscribirte al plan Supporter o hacer una donación, el pago se procesa en Stripe (Stripe, Inc. / Stripe Payments Europe Ltd.). Stripe recibe lo necesario para cobrar: tu email, datos de la tarjeta y país. Clara nunca ve ni almacena el número de tu tarjeta.",
        "Guardamos un identificador de cliente de Stripe asociado a tu cuenta y, en el caso de donaciones, el monto y la fecha del aporte para emitir recibos. Las donaciones son no reembolsables. La suscripción se renueva mensualmente y la cancelás cuando quieras desde Configuración → Suscripción.",
      ],
    },
    {
      heading: "Tus derechos",
      body: [
        "Podés exportar todos tus datos vía la API o pedirnos un dump completo. Podés borrar tu cuenta desde Configuración; cuando lo hacés, eliminamos toda tu información en cascada (gastos, meses, conexiones bancarias, mensajes de WhatsApp, tokens MCP).",
        "Si tenés dudas sobre privacidad o querés ejercer un derecho específico (acceso, rectificación, portabilidad), escribinos abriendo un issue en GitHub.",
      ],
    },
  ],
};

const EN: LocalisedMarketingContent = {
  HERO_PITCH:
    "Talk to her in plain language, send her a bank PDF, dictate a voice note over WhatsApp. Clara understands, categorizes and keeps your balance up to date. Less drama, more done.",
  ELEVATOR_PITCH:
    "Chat-first expense tracker with personality. Open source, MIT, self-hostable. No telemetry, no per-user pricing, neutral English (or rioplatense Spanish — your call).",
  FEATURES: [
    {
      emoji: "🤖",
      title: "Reads your statements",
      description:
        "Drop a bank screenshot, a PDF or a CSV. Clara extracts transactions, suggests categories and always asks before touching anything.",
    },
    {
      emoji: "🎙️",
      title: "Listens to voice notes",
      description:
        '"Paid rent" over WhatsApp is enough. Clara transcribes, classifies and updates the month without you opening the app.',
    },
    {
      emoji: "🔄",
      title: "Syncs with your bank",
      description:
        "Read-only Open Banking. Connect once, sync per month, and Clara matches transactions against your planned expenses. Clara never has access to your money.",
    },
    {
      emoji: "📅",
      title: "Organized by month",
      description:
        "A template defines a recurring expense. Each month has an independent copy that you tick when you pay it.",
    },
    {
      emoji: "🏦",
      title: "Real multi-bank",
      description:
        "Every expense knows which bank it lives in. Useful when you split rent across three accounts and want to know how much is left in each.",
    },
    {
      emoji: "📊",
      title: "Charts only when they help",
      description:
        "Clara does not throw charts for the sake of it. They render inline only when they actually clarify what's going on.",
    },
    {
      emoji: "💬",
      title: "Speaks plain English",
      description:
        "No corporate jargon. Clara talks like an accountant friend who knows what she's doing — no lectures, promised.",
    },
    {
      emoji: "🔓",
      title: "Your data is yours",
      description:
        "Open source MIT. Self-hostable on any Vercel/Postgres. No telemetry, no tracking, no AI upsell at $9.99/month.",
    },
    {
      emoji: "🤝",
      title: "MCP for your AI",
      description:
        "Clara exposes an MCP (Model Context Protocol) server. Hook it up to Claude Desktop, Cursor or ChatGPT and your own assistant can query and update your finances with your permission.",
    },
  ],
  FAQ: [
    {
      question: "What is Clara?",
      answer:
        "Clara is an AI financial assistant: a conversational expense tracker that understands bank screenshots, PDFs, CSVs and WhatsApp voice notes. She helps you plan monthly expenses, connect to your bank via Open Banking and keep your balance up to date.",
    },
    {
      question: "How much does it cost?",
      answer:
        "Clara is open source under the MIT license and free to self-host. The version we host includes 30 free daily queries with the assistant. If that's tight and you want to help cover infrastructure, you can upgrade to the Supporter plan for €7.99/month (200 daily queries) or send a one-time donation in the amount of your choice from the chat. Donations and subscription are optional: the product is still free for most people.",
    },
    {
      question: "How does Clara process PDFs and bank statements?",
      answer:
        "Clara uses multimodal language models via Vercel AI Gateway to extract transactions from PDFs, screenshots and CSVs. Processing runs on Vercel Functions: the file is uploaded to Vercel Blob temporarily, the model extracts the data, and Clara shows you a proposal before saving anything to your database.",
    },
    {
      question: "Which banks are supported?",
      answer:
        "For automatic connections (Open Banking) Clara supports most European and UK banks. The connection is read-only: Clara never has access to your money, just to your transactions. For any bank in the world you can import PDFs/CSVs or register expenses manually via chat or voice note.",
    },
    {
      question: "How does the WhatsApp integration work?",
      answer:
        "You link your number from Settings (a code arrives via WhatsApp). After that you can send Clara voice notes, photos or text: she transcribes, classifies the expense and confirms before updating the month.",
    },
    {
      question: "What does she do with my data?",
      answer:
        "Your data lives in your Postgres database (ours if you use the hosted version, yours if you self-host). No telemetry, no data sales, no model training on your info. For LLM calls we use Vercel AI Gateway in zero data retention mode.",
    },
    {
      question: "What languages does it work in?",
      answer:
        "Clara works in rioplatense Spanish (default) and English. You can switch language from the menu or just ask Clara in chat. The full UI, public pages and agent respect the choice.",
    },
    {
      question: "Can I use Clara with my own AI assistant (Claude, Cursor, ChatGPT)?",
      answer:
        "Yes. Clara exposes an MCP (Model Context Protocol) server at /api/mcp/user. You generate a token from Settings → AI access, paste it into Claude Desktop, Cursor or any MCP client, and your assistant can list months, query balance, add expenses and mark them as paid — always with your permission.",
    },
    {
      question: "Is it self-hostable?",
      answer:
        "Yes. The stack is Next.js 16 + Postgres + Prisma + Vercel AI SDK. Clone the repo, configure .env (DATABASE_URL, NEXTAUTH_SECRET, AI_GATEWAY_API_KEY), run the migrations, and deploy to Vercel in one click. The full guide is in the README.",
    },
    {
      question: "How does it compare to other finance apps?",
      answer:
        "Mint, YNAB, Fintonic and similar are spreadsheets with better design: rows, categories and reports. Clara is chat-first: you talk to her in plain language, send her a PDF and she understands, send a voice note and she registers the expense. AI is the core of the product, not a marketing feature. And it is open source.",
    },
  ],
  CHANGELOG: [
    {
      version: "0.3.1",
      date: "2026-04-30",
      title: "Charts on WhatsApp and formatted replies on Telegram",
      highlights: [
        "When the agent calls renderChart, Clara builds PNG URLs (QuickChart) and sends them before the text on both WhatsApp (Twilio) and Telegram.",
        "Telegram assistant replies use safe HTML so **bold** from the model renders correctly instead of raw Markdown.",
        "Disable outbound chart images with CLARA_OUTBOUND_CHART_IMAGES=0 or point to a self-hosted QuickChart via CLARA_QUICKCHART_BASE_URL.",
      ],
    },
    {
      version: "0.3.0",
      date: "2026-04-30",
      title: "Clara now on Telegram",
      highlights: [
        "Link Telegram from Settings → Integrations: we open `t.me` with a short code stored on your row — Telegram caps the `?start=` deep-link payload at 64 characters.",
        "Same brain as the web: the AI, the tools and the daily quota are shared across web, WhatsApp and Telegram. Send bank screenshots, voice notes or text and Clara replies in your preferred language.",
        "Private chats land today. Group support (with `@clara` mentions) is on the way.",
        "If tapping Start did nothing before, that limit was truncating the old signed token; linking now uses a short code that fits the URL.",
      ],
    },
    {
      version: "0.2.0",
      date: "2026-04-30",
      title: "Supporter plan and donations",
      highlights: [
        "When you hit Clara's daily limit, a modal opens with two options: donate any amount (one-time) or upgrade to Supporter for €7.99/mo and raise your cap to 200 queries per day.",
        "Payments via Stripe Checkout. Card numbers never touch Clara. Cancel anytime from Settings → Subscription.",
        "Self-hosting stays 100% free. The upgrade page and modal only appear when an admin enables the `quota_upsell` feature flag and Stripe keys are configured.",
      ],
    },
    {
      version: "0.1.1",
      date: "2026-04-30",
      title: "Readable bold in WhatsApp",
      highlights: [
        "Agent replies used Markdown-style **bold**, but WhatsApp expects a single *asterisk* pair. We now convert on send so totals render bold instead of showing raw asterisks.",
      ],
    },
    {
      version: "0.1.0",
      date: "2026-04-28",
      title: "Public launch of Clara",
      highlights: [
        "Public landing with full SEO and support for AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended).",
        "Public MCP server at /api/mcp so AI assistants can discover Clara.",
        "Per-user authenticated MCP server at /api/mcp/user with tokens managed from Settings.",
        "llms.txt and llms-full.txt for LLM discovery.",
      ],
    },
    {
      version: "0.0.9",
      date: "2026-04-15",
      title: "Open Banking with Revolut",
      highlights: [
        "Read-only automatic connection with European banks via Open Banking.",
        "Per-month sync and matching against planned templates.",
        "New Settings UI to connect/disconnect and configure the default import bank.",
      ],
    },
    {
      version: "0.0.8",
      date: "2026-04-01",
      title: "WhatsApp as the main inbox",
      highlights: [
        "Voice notes transcribed by Whisper and classified by the agent.",
        "Audio replies via OpenAI TTS uploaded to Vercel Blob.",
        "Number linking via one-time code from Settings.",
      ],
    },
  ],
  PRIVACY_SECTIONS: [
    {
      heading: "What Clara collects",
      body: [
        "Clara only stores what's necessary to work as an expense tracker: your email, the banks you register, the templates and lines you create, the transactions you sync via Open Banking and, optionally, your WhatsApp number to receive messages over that channel.",
        "If you use the version hosted by Trefolio, the data lives in a managed Postgres database in Europe. If you self-host, it lives wherever you put it.",
      ],
    },
    {
      heading: "What Clara does NOT do",
      body: [
        "No telemetry: we don't measure clicks, sessions or usage events for analytics.",
        "No data sales to third parties and no monetization of your information.",
        "No model training with your data: we use Vercel AI Gateway with zero data retention for every LLM call.",
        "Never has access to your money: the bank connection via Open Banking is strictly read-only.",
      ],
    },
    {
      heading: "AI processing",
      body: [
        "To understand your messages, transcribe voice and process PDFs, Clara sends content to language models through Vercel AI Gateway. Those providers operate under zero data retention: content is processed and discarded, not used for training.",
        "Files you upload (PDFs, screenshots) are stored on Vercel Blob only for the time needed to process them and are deleted afterwards.",
      ],
    },
    {
      heading: "Payments (Supporter and donations)",
      body: [
        "If you choose to subscribe to the Supporter plan or send a donation, payment is processed by Stripe (Stripe, Inc. / Stripe Payments Europe Ltd.). Stripe receives only what's needed to charge you: your email, card details and country. Clara never sees or stores your card number.",
        "We keep a Stripe customer id linked to your account and, for donations, the amount and date of the contribution to issue receipts. Donations are non-refundable. The subscription renews monthly and you can cancel anytime from Settings → Subscription.",
      ],
    },
    {
      heading: "Your rights",
      body: [
        "You can export all your data via the API or ask us for a full dump. You can delete your account from Settings; when you do, we cascade-delete all your information (expenses, months, bank connections, WhatsApp messages, MCP tokens).",
        "If you have privacy questions or want to exercise a specific right (access, rectification, portability), reach out by opening an issue on GitHub.",
      ],
    },
  ],
};

const CONTENT: Record<Locale, LocalisedMarketingContent> = { es: ES, en: EN };

export function marketingContent(locale: Locale): LocalisedMarketingContent {
  return CONTENT[locale] ?? CONTENT.es;
}

// Backwards-compat exports for callers that haven't been migrated to the
// locale-aware accessor yet. They default to Spanish (current behaviour).
export const HERO_PITCH = ES.HERO_PITCH;
export const ELEVATOR_PITCH = ES.ELEVATOR_PITCH;
export const FEATURES = ES.FEATURES;
export const FAQ = ES.FAQ;
export const CHANGELOG = ES.CHANGELOG;
export const PRIVACY_SECTIONS = ES.PRIVACY_SECTIONS;
