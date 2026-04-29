/**
 * Locale-aware copy that is exclusive to a single marketing page (landing,
 * about, features, FAQ, privacy, changelog). The shared marketing data
 * (features list, FAQ, changelog, privacy sections, hero/elevator pitches)
 * lives in `marketing-content.ts`.
 *
 * Keep this file plain data so it can be imported from server components
 * and route handlers (sitemap, llms.txt, OG image generation).
 */

import type { Locale } from "@/lib/i18n/locale";

export type LandingCopy = {
  metaTitle: string;
  metaDescription: string;
  chip: string;
  titleLine1: string;
  titleLine2Pre: string;
  titleLine2Highlight: string;
  titleLine2Post: string;
  ctaRegister: string;
  ctaSee: string;
  badgeNoCard: string;
  badgeNoTelemetry: string;
  badgeSelfHosted: string;
  chatPreviewOnline: string;
  chatPreviewConcise: string;
  chatPreviewBalanceLabel: string;
  chatPreviewUser1: string;
  chatPreviewClaraText: (rentLabel: string, leftLabel: string) => string;
  chatPreviewClaraLineLabel: string;
  chatPreviewClaraRentLabel: string;
  chatPreviewClaraLeft: string;
  chatPreviewUser2: string;
  chatPreviewSticker: string;
  statsIncome: string;
  statsIncomeSub: string;
  statsPlanned: string;
  statsPlannedSub: string;
  statsPaid: string;
  statsPaidSub: string;
  statsPending: string;
  statsPendingSub: string;
  pitchTitle1: string;
  pitchTitleAssistant: string;
  pitchTitle2: string;
  pitchExtra: string;
  mcpSticker: string;
  mcpTitlePart1: string;
  mcpTitleHighlight: string;
  mcpBody: string;
  mcpHowTo: string;
  mcpPublic: string;
  mcpConfigComment: string;
  ruleSticker: string;
  ruleTitlePart1: string;
  ruleTitleHighlight: string;
  ruleBody: string;
  finalTitlePart1: string;
  finalTitleHighlight: string;
  finalTitlePart2: string;
  finalBody: string;
  finalRegister: string;
  finalFaq: string;
};

export type AboutCopy = {
  metaTitle: string;
  metaDescription: string;
  breadcrumbHome: string;
  breadcrumbSelf: string;
  heroSticker: string;
  heroTitle1: string;
  heroBrand: string;
  heroTitle2: string;
  heroBody: string;
  whyTitle: string;
  whyBody: string[];
  bornStickerLeft: string;
  bornStickerRight: string;
  bornTitle: string;
  bornBody: string[];
  personalityTitle: string;
  personalityBody: string;
  featuresTitle: string;
  featuresStickerLabel: string;
  oss: {
    sticker1: string;
    sticker2: string;
    title: string;
    body: string;
    seeCode: string;
    reportBug: string;
  };
  madeBy: string;
  trefolio: string;
};

export type FeatureSection = {
  id: string;
  title: string;
  body: string[];
};

export type FeaturesCopy = {
  metaTitle: string;
  metaDescription: string;
  chip: string;
  title1: string;
  titleHighlight: string;
  title2: string;
  intro: string;
  cta1: string;
  cta2: string;
  ctaCode: string;
  breadcrumbHome: string;
  breadcrumbSelf: string;
  sections: FeatureSection[];
};

export type FaqCopy = {
  metaTitle: string;
  metaDescription: string;
  chip: string;
  title1: string;
  titleHighlight: string;
  intro: string;
  cta1: string;
  cta2: string;
};

export type ChangelogCopy = {
  metaTitle: string;
  metaDescription: string;
  chip: string;
  title1: string;
  titleHighlight: string;
  intro: string;
  publishedOn: (date: string) => string;
  cta1: string;
  cta2: string;
};

export type PrivacyCopy = {
  metaTitle: string;
  metaDescription: string;
  chip: string;
  title1: string;
  titleHighlight: string;
  titleSuffix: string;
  intro: string;
  cta1: string;
  cta2: string;
};

const LANDING_ES: LandingCopy = {
  metaTitle: "Clara — tu asistente financiera con IA",
  metaDescription:
    "Tu money coach con IA. Chateá con tu plata: PDFs, notas de voz, Open Banking. Open source MIT, self-hostable, con servidor MCP para integrar con Claude, ChatGPT y Cursor.",
  chip: "Money coach con IA · Open Source · MIT",
  titleLine1: "Tu plata,",
  titleLine2Pre: "finalmente ",
  titleLine2Highlight: "Clara",
  titleLine2Post: ".",
  ctaRegister: "Empezar gratis",
  ctaSee: "Ver qué hace",
  badgeNoCard: "Sin tarjeta",
  badgeNoTelemetry: "Sin telemetría",
  badgeSelfHosted: "Self-hosteable",
  chatPreviewOnline: "en línea · habla rioplatense",
  chatPreviewConcise: "conciso",
  chatPreviewBalanceLabel: "balance · abr '26",
  chatPreviewUser1: "Pagué el alquiler hoy, $850",
  chatPreviewClaraText: (rentLabel, leftLabel) =>
    `Listo, marqué ${rentLabel} como pagado en abril ✅. Te quedan ${leftLabel} para los pendientes del mes.`,
  chatPreviewClaraLineLabel: "Alquiler · vivienda · Galicia",
  chatPreviewClaraRentLabel: "Alquiler",
  chatPreviewClaraLeft: "USD 1.240",
  chatPreviewUser2: "Tirame un PDF del banco",
  chatPreviewSticker: "+ MCP-ready",
  statsIncome: "Ingreso",
  statsIncomeSub: "USD · abril",
  statsPlanned: "Planificado",
  statsPlannedSub: "7 plantillas",
  statsPaid: "Pagado",
  statsPaidSub: "+200 hoy",
  statsPending: "Pendiente",
  statsPendingSub: "2 ítems",
  pitchTitle1: "Una ",
  pitchTitleAssistant: "asistente",
  pitchTitle2: ", no una planilla.",
  pitchExtra:
    "Cada feature está pensada para que entiendas tu plata sin abrir Excel — y para que tu propio AI te ayude sin pedirte permiso quince veces.",
  mcpSticker: "MCP-ready",
  mcpTitlePart1: "Tu propio AI puede ",
  mcpTitleHighlight: "hablar con Clara",
  mcpBody:
    "Clara expone un servidor MCP (Model Context Protocol). Generás un token desde Configuración y lo pegás en Claude Desktop, Cursor o cualquier cliente compatible: tu asistente consulta tus meses, mira el balance y registra gastos con tu permiso.",
  mcpHowTo: "Cómo conectarlo",
  mcpPublic: "MCP público",
  mcpConfigComment: "# Claude Desktop / Cursor mcp.json",
  ruleSticker: "menos drama",
  ruleTitlePart1: "La regla de Clara: ",
  ruleTitleHighlight: "menos planilla, más decisiones",
  ruleBody:
    "Solo las plantillas recurrentes nacen pendientes. Lo que cargues en el mes — por chat, voz o foto — se marca como pagado por defecto. Vos te enfocás en decidir, Clara se ocupa del resto.",
  finalTitlePart1: "Tu plata ",
  finalTitleHighlight: "clara",
  finalTitlePart2: ", en cinco minutos.",
  finalBody:
    "Creás cuenta, conectás (opcional) tu banco o WhatsApp, y Clara se hace cargo del resto.",
  finalRegister: "Empezar gratis",
  finalFaq: "Resolver dudas",
};

const LANDING_EN: LandingCopy = {
  metaTitle: "Clara — your AI financial assistant",
  metaDescription:
    "Your AI money coach. Chat with your money: PDFs, voice notes, Open Banking. Open source MIT, self-hostable, with an MCP server to plug into Claude, ChatGPT and Cursor.",
  chip: "AI money coach · Open Source · MIT",
  titleLine1: "Your money,",
  titleLine2Pre: "finally ",
  titleLine2Highlight: "Clara",
  titleLine2Post: ".",
  ctaRegister: "Start free",
  ctaSee: "See what it does",
  badgeNoCard: "No card",
  badgeNoTelemetry: "No telemetry",
  badgeSelfHosted: "Self-hostable",
  chatPreviewOnline: "online · speaks plain English",
  chatPreviewConcise: "concise",
  chatPreviewBalanceLabel: "balance · apr '26",
  chatPreviewUser1: "Paid rent today, $850",
  chatPreviewClaraText: (rentLabel, leftLabel) =>
    `Done — marked ${rentLabel} as paid for April ✅. You have ${leftLabel} left for the rest of the month.`,
  chatPreviewClaraLineLabel: "Rent · housing · Galicia",
  chatPreviewClaraRentLabel: "Rent",
  chatPreviewClaraLeft: "USD 1,240",
  chatPreviewUser2: "Send me a bank PDF",
  chatPreviewSticker: "+ MCP-ready",
  statsIncome: "Income",
  statsIncomeSub: "USD · April",
  statsPlanned: "Planned",
  statsPlannedSub: "7 templates",
  statsPaid: "Paid",
  statsPaidSub: "+200 today",
  statsPending: "Pending",
  statsPendingSub: "2 items",
  pitchTitle1: "An ",
  pitchTitleAssistant: "assistant",
  pitchTitle2: ", not a spreadsheet.",
  pitchExtra:
    "Every feature is built so you can understand your money without opening Excel — and so your own AI can help without asking permission fifteen times.",
  mcpSticker: "MCP-ready",
  mcpTitlePart1: "Your own AI can ",
  mcpTitleHighlight: "talk to Clara",
  mcpBody:
    "Clara exposes an MCP (Model Context Protocol) server. Generate a token from Settings and paste it into Claude Desktop, Cursor or any compatible client: your assistant queries your months, checks the balance, and registers expenses with your permission.",
  mcpHowTo: "How to connect",
  mcpPublic: "Public MCP",
  mcpConfigComment: "# Claude Desktop / Cursor mcp.json",
  ruleSticker: "less drama",
  ruleTitlePart1: "Clara's rule: ",
  ruleTitleHighlight: "less spreadsheet, more decisions",
  ruleBody:
    "Only recurring templates start as pending. Anything you log during the month — chat, voice or photo — defaults to paid. You focus on deciding, Clara handles the rest.",
  finalTitlePart1: "Your money ",
  finalTitleHighlight: "clear",
  finalTitlePart2: ", in five minutes.",
  finalBody:
    "Sign up, optionally connect your bank or WhatsApp, and Clara takes care of the rest.",
  finalRegister: "Start free",
  finalFaq: "Got questions?",
};

const ABOUT_ES: AboutCopy = {
  metaTitle: "Sobre Clara",
  metaDescription:
    "Por qué Clara: una asistente financiera con IA pensada alrededor de la claridad. Open source MIT, hecha por Trefolio para gente que quiere entender en qué se le va la plata sin pelearse con planillas.",
  breadcrumbHome: "Inicio",
  breadcrumbSelf: "Sobre Clara",
  heroSticker: "Asistente financiera con IA",
  heroTitle1: "Hola, soy ",
  heroBrand: "Clara",
  heroTitle2: ". Tu plata, finalmente clara.",
  heroBody:
    "Una asistente financiera con IA. Entiendo extractos bancarios, notas de voz, PDFs y preguntas en castellano normal. No soy una planilla con mejor diseño — soy alguien con quien podés hablar de tu guita sin vergüenza.",
  whyTitle: "La idea es la claridad.",
  whyBody: [
    "La mayoría de las apps de finanzas hacen lo opuesto a lo que decían que iban a hacer: te muestran filas, gráficos de torta, categorías que vos no creaste, banners de upsell — y al final del mes seguís sin saber a dónde se fueron 400 dólares.",
    "Clara existe para invertir esa lógica. La pregunta que guía el producto no es \"¿cómo te muestro más datos?\", es ¿qué tenés que entender hoy?. De ahí el nombre. Clara aclara: traduce extractos a decisiones, voz a registros, fotos a categorías. El piso siempre es entender, no acumular.",
    "Hablás con Clara como hablás con cualquiera. Le mandás un PDF y entiende. Una nota de voz por WhatsApp y registra el gasto. Conectás Open Banking y matchea movimientos contra tus plantillas sin que vos toques nada. Less drama, more done.",
  ],
  bornStickerLeft: "trefolio.com",
  bornStickerRight: "→ los que construyeron Clara",
  bornTitle: "Construida por gente que tampoco entendía a dónde iba la plata.",
  bornBody: [
    "Somos el equipo detrás de trefolio.com, una plataforma de portfolios para profesionales tech. Ganamos bien. Y tampoco entendíamos a dónde iba la plata.",
    "Probamos apps de finanzas — todas eran planillas glorificadas, jardines cerrados con suscripciones caras, o simplemente no hablaban nuestro idioma (literal y figuradamente). Las que tenían IA la usaban como feature de marketing, no como núcleo del producto.",
    "Así que construimos la nuestra. Queríamos algo que leyera un PDF del banco, escuchara una nota de voz de WhatsApp, se sincronizara con Revolut, y respondiera en rioplatense sin sonar a chatbot corporativo. Una asistente de verdad — no un formulario con IA encima.",
    "La llamamos Clara porque ese es el norte: que sea claro qué pasa con tu plata. Y la hicimos open-source porque creemos que tus finanzas son tuyas — ninguna empresa debería tener el monopolio de entenderlas.",
  ],
  personalityTitle: "Tu money coach con IA.",
  personalityBody:
    "Habla rioplatense (o inglés neutro), no juzga, te muestra números antes de tomar cualquier acción.",
  featuresTitle: "Todo lo que hace Clara.",
  featuresStickerLabel: "Qué puede hacer",
  oss: {
    sticker1: "Licencia MIT",
    sticker2: "Open Source",
    title: "Tu data es tuya, siempre.",
    body: "Clara no tiene telemetría, no vende datos, no cobra por usuario. El código es público, podés hostearlo vos mismo, y si alguna vez decidimos cerrar el servicio el repo sigue ahí. Sin excusas.",
    seeCode: "Ver el código en GitHub",
    reportBug: "Reportar un bug",
  },
  madeBy: "Hecho con ☕ y una sana desconfianza de las planillas.",
  trefolio: "trefolio.com",
};

const ABOUT_EN: AboutCopy = {
  metaTitle: "About Clara",
  metaDescription:
    "Why Clara: an AI financial assistant designed around clarity. Open source MIT, built by Trefolio for people who want to understand where their money goes without fighting spreadsheets.",
  breadcrumbHome: "Home",
  breadcrumbSelf: "About Clara",
  heroSticker: "AI financial assistant",
  heroTitle1: "Hi, I'm ",
  heroBrand: "Clara",
  heroTitle2: ". Your money, finally clear.",
  heroBody:
    "An AI financial assistant. I understand bank statements, voice notes, PDFs and questions in plain English. I'm not a spreadsheet with a nicer UI — I'm someone you can talk to about your money without shame.",
  whyTitle: "The idea is clarity.",
  whyBody: [
    "Most finance apps do the opposite of what they promised: they show you rows, pie charts, categories you didn't create, upsell banners — and at the end of the month you still don't know where $400 went.",
    'Clara exists to flip that logic. The question driving the product is not "how do I show you more data?", it is what do you need to understand today?. Hence the name. Clara clears things up: she translates statements into decisions, voice into entries, photos into categories. The baseline is always understanding, not accumulating.',
    "You talk to Clara like you talk to anyone. Send her a PDF and she understands. A voice note over WhatsApp and she registers the expense. Connect Open Banking and she matches transactions against your templates without you touching anything. Less drama, more done.",
  ],
  bornStickerLeft: "trefolio.com",
  bornStickerRight: "→ the team behind Clara",
  bornTitle: "Built by people who didn't understand where their money went either.",
  bornBody: [
    "We are the team behind trefolio.com, a portfolio platform for tech professionals. We earned well. And we still didn't understand where the money went.",
    "We tried finance apps — all of them were glorified spreadsheets, walled gardens with expensive subscriptions, or simply didn't speak our language (literally and figuratively). The ones with AI used it as a marketing feature, not as the core of the product.",
    "So we built our own. We wanted something that reads a bank PDF, listens to a WhatsApp voice note, syncs with Revolut, and replies in plain English without sounding like a corporate chatbot. A real assistant — not a form with AI bolted on.",
    "We called her Clara because that's the north star: keep it clear what happens with your money. And we made her open source because we believe your finances are yours — no company should monopolize understanding them.",
  ],
  personalityTitle: "Your AI money coach.",
  personalityBody:
    "Speaks plain English (or rioplatense Spanish), doesn't judge, shows you numbers before taking any action.",
  featuresTitle: "Everything Clara does.",
  featuresStickerLabel: "What she can do",
  oss: {
    sticker1: "MIT License",
    sticker2: "Open Source",
    title: "Your data is yours, always.",
    body: "Clara has no telemetry, no data sales, no per-user pricing. The code is public, you can host it yourself, and if we ever shut the service down the repo is still there. No excuses.",
    seeCode: "See the code on GitHub",
    reportBug: "Report a bug",
  },
  madeBy: "Made with ☕ and a healthy distrust of spreadsheets.",
  trefolio: "trefolio.com",
};

const FEATURES_ES: FeaturesCopy = {
  metaTitle: "Features",
  metaDescription:
    "Todo lo que Clara puede hacer: leer extractos PDF/CSV, transcribir notas de voz por WhatsApp, sincronizarse con tu banco vía Open Banking, planificar mes a mes y exponer un servidor MCP para tu propio AI assistant.",
  chip: "Features",
  title1: "Todo lo que hace Clara, ",
  titleHighlight: "sin marketing-speak",
  title2: ".",
  intro:
    "Las features están agrupadas por superficie. Cada una tiene un para qué claro: hacer que entender tu plata sea conversacional, no operativo.",
  cta1: "Empezar gratis",
  cta2: "Ver FAQ",
  ctaCode: "Código en GitHub →",
  breadcrumbHome: "Inicio",
  breadcrumbSelf: "Features",
  sections: [
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
        "Linkeás tu número desde Configuración y mandás notas de voz, fotos o texto a Clara por WhatsApp. Clara transcribe la voz, clasifica el gasto y responde en audio.",
        "Es el modo más rápido de registrar un gasto: caminás, mandás “pagué la luz $120”, y queda registrado.",
      ],
    },
    {
      id: "mcp",
      title: "MCP para tu propio AI assistant",
      body: [
        "Clara expone dos servidores MCP (Model Context Protocol):",
        "• `/api/mcp` — Público, sin auth. Tu AI assistant puede consultar features, FAQ y docs de Clara para responder preguntas “qué es Clara”, “cómo procesa PDFs”, etc.",
        "• `/api/mcp/user` — Autenticado por bearer token (lo generás desde Configuración → Acceso para AI). Tu AI puede listar tus meses, consultar balance, agregar gastos, marcar como pagado — siempre con el alcance de tu token.",
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
  ],
};

const FEATURES_EN: FeaturesCopy = {
  metaTitle: "Features",
  metaDescription:
    "Everything Clara can do: read PDF/CSV statements, transcribe WhatsApp voice notes, sync with your bank via Open Banking, plan month by month and expose an MCP server for your own AI assistant.",
  chip: "Features",
  title1: "Everything Clara does, ",
  titleHighlight: "no marketing-speak",
  title2: ".",
  intro:
    "Features are grouped by surface. Each has a clear purpose: make understanding your money conversational, not operational.",
  cta1: "Start free",
  cta2: "See FAQ",
  ctaCode: "Code on GitHub →",
  breadcrumbHome: "Home",
  breadcrumbSelf: "Features",
  sections: [
    {
      id: "chat",
      title: "Chat-first, multimodal",
      body: [
        "Clara is a conversation, not a form. You send her text, a bank photo, a PDF, a CSV or a voice note — she understands.",
        "Under the hood she uses Vercel AI SDK v6 with AI Gateway: multimodal models to read images and PDFs, Whisper for voice transcription, OpenAI TTS to reply in audio when you message her on WhatsApp.",
        "Before touching your database she always shows you a proposal and asks for confirmation. Clara never touches your money without explicit permission.",
      ],
    },
    {
      id: "month",
      title: "Organized by month, with templates",
      body: [
        "Every recurring expense lives as a template (Expense). Each month has its own copy (MonthExpenseLine) that you tick when you pay it. If a month has a one-off expense, you add it only there.",
        "This gives you something flat spreadsheets don't: a month-by-month history that distinguishes recurring from one-off, with an independent balance for each.",
      ],
    },
    {
      id: "banking",
      title: "Open Banking + multi-bank",
      body: [
        "Read-only automatic Open Banking connection: sync your Revolut or any European bank, and Clara matches the transactions against your planned templates. Clara never has access to your money.",
        "Every expense knows which bank it lives in. Useful when you split rent across three accounts and want to know how much is left in each.",
      ],
    },
    {
      id: "whatsapp",
      title: "WhatsApp as your main inbox",
      body: [
        "Link your number from Settings and send voice notes, photos or text to Clara on WhatsApp. Clara transcribes voice, classifies the expense and replies in audio.",
        'It is the fastest way to register an expense: you walk, you send "paid the electricity $120", and it is logged.',
      ],
    },
    {
      id: "mcp",
      title: "MCP for your own AI assistant",
      body: [
        "Clara exposes two MCP (Model Context Protocol) servers:",
        '• `/api/mcp` — Public, no auth. Your AI assistant can query features, FAQ and Clara docs to answer "what is Clara", "how does she process PDFs", etc.',
        "• `/api/mcp/user` — Authenticated by bearer token (generated from Settings → AI access). Your AI can list your months, query balance, add expenses, mark them as paid — always within the scope of your token.",
        "Works out-of-the-box with Claude Desktop, Cursor, ChatGPT (custom GPTs) and any MCP-compatible client.",
      ],
    },
    {
      id: "self-hostable",
      title: "Open source, MIT, self-hostable",
      body: [
        "Stack: Next.js 16 (App Router) + Postgres + Prisma 7 + Vercel AI SDK v6. Optimized for Vercel but runs on any Node.js 24.",
        "Clone the repo, configure .env, run `npm run prisma:migrate` and `vercel deploy` — done. Full guide in the README.",
        "No telemetry, no tracking. Your data lives wherever you put it.",
      ],
    },
  ],
};

const FAQ_ES: FaqCopy = {
  metaTitle: "FAQ",
  metaDescription:
    "Preguntas frecuentes sobre Clara: precio, idiomas, bancos, integraciones con Claude/Cursor/ChatGPT, self-hosting y privacidad.",
  chip: "Preguntas frecuentes",
  title1: "Resolvamos ",
  titleHighlight: "las dudas",
  intro:
    "Si necesitás más detalles, abrí un issue en GitHub o miramos juntos en el chat con Clara.",
  cta1: "Empezar gratis",
  cta2: "Ver changelog",
};

const FAQ_EN: FaqCopy = {
  metaTitle: "FAQ",
  metaDescription:
    "Common questions about Clara: pricing, languages, banks, integrations with Claude/Cursor/ChatGPT, self-hosting and privacy.",
  chip: "Frequently asked",
  title1: "Let's clear ",
  titleHighlight: "the air",
  intro:
    "If you need more details, open an issue on GitHub or chat with Clara directly.",
  cta1: "Start free",
  cta2: "See changelog",
};

const CHANGELOG_ES: ChangelogCopy = {
  metaTitle: "Changelog",
  metaDescription:
    "Historia de cambios y releases de Clara — open source, MIT, hecha en público.",
  chip: "Historia de releases",
  title1: "Lo que vino ",
  titleHighlight: "antes",
  intro:
    "Cambios visibles, en público. Cada versión apunta a lo más importante; el detalle vive en los commits del repo.",
  publishedOn: (date) => `Publicado el ${date}`,
  cta1: "Empezar gratis",
  cta2: "Ver el repo",
};

const CHANGELOG_EN: ChangelogCopy = {
  metaTitle: "Changelog",
  metaDescription: "Release history for Clara — open source, MIT, built in public.",
  chip: "Release history",
  title1: "What came ",
  titleHighlight: "before",
  intro:
    "Visible changes, in public. Each version highlights the most important shipments; the rest lives in the repo's commits.",
  publishedOn: (date) => `Published on ${date}`,
  cta1: "Start free",
  cta2: "Open the repo",
};

const PRIVACY_ES: PrivacyCopy = {
  metaTitle: "Privacidad",
  metaDescription:
    "Qué datos guarda Clara, qué hace y qué no hace con ellos. Sin telemetría, sin venta de datos, IA con zero data retention.",
  chip: "Privacidad",
  title1: "Tu plata, ",
  titleHighlight: "tu data",
  titleSuffix: ".",
  intro:
    "Clara está pensada para que tu información financiera te siga perteneciendo. Esto es lo que recolectamos, lo que no, y cómo procesamos cada cosa.",
  cta1: "Empezar gratis",
  cta2: "Ver código",
};

const PRIVACY_EN: PrivacyCopy = {
  metaTitle: "Privacy",
  metaDescription:
    "What data Clara stores, what it does — and doesn't do — with it. No telemetry, no data sales, AI calls in zero data retention.",
  chip: "Privacy",
  title1: "Your money, ",
  titleHighlight: "your data",
  titleSuffix: ".",
  intro:
    "Clara is built so your financial information stays yours. Here's what we collect, what we don't, and how we process each thing.",
  cta1: "Start free",
  cta2: "See the code",
};

export function landingCopy(locale: Locale): LandingCopy {
  return locale === "en" ? LANDING_EN : LANDING_ES;
}

export function aboutCopy(locale: Locale): AboutCopy {
  return locale === "en" ? ABOUT_EN : ABOUT_ES;
}

export function featuresCopy(locale: Locale): FeaturesCopy {
  return locale === "en" ? FEATURES_EN : FEATURES_ES;
}

export function faqCopy(locale: Locale): FaqCopy {
  return locale === "en" ? FAQ_EN : FAQ_ES;
}

export function changelogCopy(locale: Locale): ChangelogCopy {
  return locale === "en" ? CHANGELOG_EN : CHANGELOG_ES;
}

export function privacyCopy(locale: Locale): PrivacyCopy {
  return locale === "en" ? PRIVACY_EN : PRIVACY_ES;
}
