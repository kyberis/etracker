/**
 * Single source of truth for marketing copy used across the public marketing
 * pages, `/llms.txt`, `/llms-full.txt`, and the public MCP server.
 *
 * Keep this file plain data (no JSX) so it can be imported from both Server
 * Components and Edge route handlers.
 */

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

export const HERO_PITCH =
  "Hablale en castellano, mandale el PDF del banco, dictale una nota de voz por WhatsApp. Clara entiende, categoriza y mantiene tu balance al día. Less drama, more done.";

export const ELEVATOR_PITCH =
  "Chat-first expense tracker con personalidad. Open source, MIT, self-hostable. Sin telemetría, sin precio por usuario, hablando rioplatense.";

export const FEATURES: MarketingFeature[] = [
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
];

export const FAQ: MarketingFaq[] = [
  {
    question: "¿Qué es Clara?",
    answer:
      "Clara es una asistente financiera con IA: un expense tracker conversacional que entiende fotos del banco, PDFs, CSVs y notas de voz por WhatsApp. Te ayuda a planificar tus gastos mes a mes, conectarte a tu banco vía Open Banking y mantener tu balance al día.",
  },
  {
    question: "¿Cuánto cuesta?",
    answer:
      "Clara es 100% gratis y open source bajo licencia MIT. Podés correr la versión hosteada por nosotros sin pagar, o self-hostearla en tu propio Vercel + Postgres. No tenemos suscripciones, ni precio por usuario, ni features pagas.",
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
      "Linkeás tu número desde Settings (te llega un código por WhatsApp). Después podés mandarle a Clara notas de voz, fotos o texto: ella transcribe, clasifica el gasto y te confirma antes de actualizar el mes.",
  },
  {
    question: "¿Qué hace con mis datos?",
    answer:
      "Tus datos viven en tu base de datos Postgres (la nuestra si usás la versión hosteada, la tuya si self-hosteás). No hay telemetría, no se venden datos, no se entrenan modelos con tu información. Para LLM usamos Vercel AI Gateway en modo zero data retention.",
  },
  {
    question: "¿En qué idiomas funciona?",
    answer:
      "La UI está en español rioplatense por defecto y los prompts del asistente también. Como el código es open source, cambiar a otra variante o idioma es un PR de pocas líneas en src/lib/ai/run-expense-agent.ts.",
  },
  {
    question: "¿Puedo usar Clara con mi propio AI assistant (Claude, Cursor, ChatGPT)?",
    answer:
      "Sí. Clara expone un servidor MCP (Model Context Protocol) en /api/mcp/user. Generás un token desde Settings → Acceso para AI, lo pegás en Claude Desktop, Cursor o cualquier cliente MCP, y tu asistente puede listar tus meses, consultar balance, agregar gastos y marcar como pagado — siempre con tu permiso.",
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
];

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.1.0",
    date: "2026-04-28",
    title: "Apertura pública de Clara",
    highlights: [
      "Landing pública con SEO completo y soporte para AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended).",
      "Servidor MCP público en /api/mcp para que AI assistants conozcan Clara.",
      "Servidor MCP autenticado por usuario en /api/mcp/user con tokens MCP gestionados desde Settings.",
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
      "UI nueva en Settings para conectar/desconectar y configurar el banco por defecto.",
    ],
  },
  {
    version: "0.0.8",
    date: "2026-04-01",
    title: "WhatsApp como inbox principal",
    highlights: [
      "Notas de voz transcritas por Whisper y clasificadas por el agente.",
      "Respuestas en audio vía OpenAI TTS subidas a Vercel Blob.",
      "Linking de número vía código de un solo uso desde Settings.",
    ],
  },
];

export const PRIVACY_SECTIONS: { heading: string; body: string[] }[] = [
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
    heading: "Tus derechos",
    body: [
      "Podés exportar todos tus datos vía la API o pedirnos un dump completo. Podés borrar tu cuenta desde Settings; cuando lo hacés, eliminamos toda tu información en cascada (gastos, meses, conexiones bancarias, mensajes de WhatsApp, tokens MCP).",
      "Si tenés dudas sobre privacidad o querés ejercer un derecho específico (acceso, rectificación, portabilidad), escribinos abriendo un issue en GitHub.",
    ],
  },
];
