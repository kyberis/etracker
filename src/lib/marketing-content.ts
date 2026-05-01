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
    "Hablale en castellano, mandale el PDF del banco o dictale una nota de voz desde Telegram. Clara entiende, categoriza y mantiene tu balance al día. Less drama, more done.",
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
        "“Pagué el alquiler” desde el chat web o Telegram es suficiente. Clara transcribe, clasifica y actualiza el mes sin que abras la app.",
    },
    {
      emoji: "✈️",
      title: "Clara también en Telegram",
      description:
        "Vinculá Telegram desde Configuración → Integraciones y chateá con Clara desde el celular o el escritorio. Mismo cerebro, mismo cupo y mismas herramientas que en la web: mandale una foto del banco, una nota de voz o texto, y te responde en castellano rioplatense.",
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
        "Clara es una asistente financiera con IA: un expense tracker conversacional que entiende fotos del banco, PDFs, CSVs y notas de voz desde el chat web o Telegram. Te ayuda a planificar tus gastos mes a mes y mantener tu balance al día.",
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
        "Cualquier banco del mundo: importás PDFs/CSVs o registrás gastos manualmente vía chat o nota de voz. Clara nunca tiene acceso a tu dinero — solo procesa los archivos o mensajes que vos le pasés.",
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
      version: "0.6.0",
      date: "2026-05-01",
      title: "Ingresos múltiples: sueldos, freelance y cobros puntuales",
      highlights: [
        "Sumá ingresos puntuales del mes (freelance, bonos, devoluciones, regalos) sin pisar el sueldo: cada cobro es una línea independiente, con fecha real y banco opcional.",
        "Múltiples ingresos recurrentes con plantillas, igual que los gastos: declarás sueldo + alquiler que cobrás + retainer una sola vez y cada mes nuevo aparecen como pendientes para confirmar cuando entra la plata.",
        "Multi-moneda con tipo de cambio congelado: si te pagan en USD y tu moneda principal es ARS, Clara te guarda el rate del momento del cobro y muestra el total convertido sin mentir.",
        "Decile a Clara por chat: \"cobré $250 de freelance\", \"me transfirieron el sueldo\", \"me llegó el bono\" — registra la línea en el mes en curso, deduplica si ya estaba y te avisa.",
        "Nueva página /incomes para ver y editar tus plantillas de ingreso, espejo de la página de gastos.",
      ],
    },
    {
      version: "0.5.0",
      date: "2026-05-01",
      title: "Ahorro: pila global con ledger e integración total",
      highlights: [
        "Nueva sección /ahorro: pila de ahorro con balance al día, depósitos y retiros manuales, y movimientos del sistema (aporte mensual, sobrante de cierre, cobertura de deuda) explicados uno por uno.",
        "Cada mes podés registrar un aporte mensual informativo: suma a tu ahorro, queda atado al mes, pero no toca el saldo del mes ni aparece como gasto.",
        "Si el mes anterior te cierra en negativo, Clara te pregunta antes de abrir el nuevo: cubrir todo o lo que se pueda con tu ahorro, o pasarlo como deuda al mes que viene. Sin sorpresas.",
        "Todo manejado también por chat y por MCP: la agente puede ver tu pila, agregar movimientos manuales, fijar el aporte del mes y cubrir deuda con ahorro.",
      ],
    },
    {
      version: "0.4.2",
      date: "2026-05-01",
      title: "Mismos env vars de email que trefolio",
      highlights: [
        "Clara ahora lee `APP_BASE_URL` y `APP_SESSION_SECRET` además de `NEXT_PUBLIC_APP_URL` / `NEXTAUTH_SECRET`. Si self-hosteás Clara junto a trefolio, podés reutilizar las mismas variables sin renombrar nada.",
        "Los emails de verificación siguen saliendo por Resend con el mismo `RESEND_API_KEY` y `RESEND_FROM_ADDRESS` que ya configuraste en trefolio.",
        "Se documentó la equivalencia en `.env.example` para que al levantar un nuevo deploy sepas exactamente qué pegar.",
      ],
    },
    {
      version: "0.4.1",
      date: "2026-05-01",
      title: "Passkeys + ojito para mostrar la contraseña",
      highlights: [
        "Login con passkey: huella, Face ID o llave USB. Más rápido y más seguro que la contraseña — y no hay nada que tipear.",
        "Podés crear, renombrar y borrar tus passkeys desde Configuración. Cada usuario puede tener varias (laptop, celular, llave física).",
        "Los inputs de contraseña ahora tienen un ojito para mostrar/ocultar lo que escribís en login, registro y configuración.",
      ],
    },
    {
      version: "0.4.0",
      date: "2026-05-01",
      title: "Telegram en primera fila + login con captcha y email verificado",
      highlights: [
        "Telegram pasa a ser una feature destacada en la home: Clara entiende foto, voz y texto en Telegram con el mismo cerebro y cupo que la web.",
        "El registro y el login con email/contraseña ahora pasan por Cloudflare Turnstile (captcha invisible) para frenar bots.",
        "Al registrarte te mandamos un correo con un enlace firmado (JWT, vence en 24 hs) vía Resend; tenés que verificar el email antes de poder iniciar sesión con contraseña.",
        "El login con Google sigue igual: si Google ya marca el email como verificado, no pedimos un paso extra.",
      ],
    },
    {
      version: "0.3.3",
      date: "2026-05-01",
      title: "Build: versión de API de Stripe alineada al SDK",
      highlights: [
        "El cliente de Stripe vuelve a usar la versión de API que tipa el paquete instalado, así el deploy en Vercel compila de nuevo.",
      ],
    },
    {
      version: "0.3.2",
      date: "2026-05-01",
      title: "Telegram: mensajes largos y gráficos sin cortar el envío",
      highlights: [
        "Los mensajes HTML ya no se parten en medio de una negrita: Telegram dejaba de entregar la respuesta entera cuando rechazaba el parseo.",
        "Si igual falla el HTML, reintentamos el mismo fragmento en texto plano (sin perder el resto del mensaje).",
        "Si una URL de gráfico falla, seguimos con el texto en lugar de frenar toda la respuesta.",
      ],
    },
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
        "Clara solo guarda lo necesario para funcionar como tracker de gastos: tu email, los bancos que registres, las plantillas y líneas de gasto que crees, los mensajes del chat (web y Telegram), tu pila de ahorro y los movimientos asociados, y, si vinculás Telegram, tu user id de Telegram para enrutar mensajes.",
        "Si usás la versión hosteada por Trefolio, los datos viven en una base Postgres administrada en Europa. Si self-hosteás, viven donde vos los pongas.",
      ],
    },
    {
      heading: "Qué NO hace Clara",
      body: [
        "No tiene telemetría: no medimos clicks, sesiones ni eventos de uso para analytics.",
        "No vende datos a terceros y no monetiza tu información.",
        "No entrena modelos con tu información: usamos Vercel AI Gateway con zero data retention para todas las llamadas LLM.",
        "Nunca tiene acceso a tu dinero: Clara solo procesa archivos o mensajes que vos le pasés explícitamente.",
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
      heading: "Captcha y verificación de email",
      body: [
        "El registro y el inicio de sesión con email/contraseña pasan por Cloudflare Turnstile (Cloudflare, Inc.) para frenar bots. Cloudflare recibe la IP y metadatos del navegador necesarios para evaluar el desafío; nunca le mandamos tu email ni tu contraseña. Si te self-hosteás Clara y no configurás Turnstile, esa capa se desactiva sola.",
        "Cuando te registrás, mandamos un correo con un enlace firmado (vence en 24 hs) usando Resend (Resend, Inc.). El enlace solo prueba que el email es tuyo; no compartimos tu contraseña ni datos del balance con Resend. Tenés que confirmar el email antes de poder iniciar sesión con contraseña. Iniciar sesión con Google sigue igual: si Google ya marca tu email como verificado, no pedimos un paso extra.",
      ],
    },
    {
      heading: "Tus derechos",
      body: [
        "Podés exportar todos tus datos vía la API o pedirnos un dump completo. Podés borrar tu cuenta desde Configuración; cuando lo hacés, eliminamos toda tu información en cascada (gastos, meses, mensajes de Telegram, tokens MCP).",
        "Si tenés dudas sobre privacidad o querés ejercer un derecho específico (acceso, rectificación, portabilidad), escribinos abriendo un issue en GitHub.",
      ],
    },
  ],
};

const EN: LocalisedMarketingContent = {
  HERO_PITCH:
    "Talk to her in plain language, send her a bank PDF, dictate a voice note from the web chat or Telegram. Clara understands, categorizes and keeps your balance up to date. Less drama, more done.",
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
        '"Paid rent" from the web chat or Telegram is enough. Clara transcribes, classifies and updates the month without you opening the app.',
    },
    {
      emoji: "✈️",
      title: "Clara on Telegram too",
      description:
        "Link Telegram from Settings → Integrations and chat with Clara from your phone or desktop. Same brain, same quota and same tools as the web: send a bank screenshot, a voice note or plain text, and Clara replies in your language.",
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
        "Clara is an AI financial assistant: a conversational expense tracker that understands bank screenshots, PDFs, CSVs and voice notes from the web chat or Telegram. She helps you plan monthly expenses and keep your balance up to date.",
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
        "Any bank in the world: import PDFs/CSVs or register expenses manually via chat or voice note. Clara never has access to your money — she only processes the files or messages you explicitly share with her.",
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
      version: "0.6.0",
      date: "2026-05-01",
      title: "Multiple incomes: salaries, freelance and one-off payments",
      highlights: [
        "Log one-off income for the month (freelance, bonuses, refunds, gifts) without overwriting your salary: each payment is its own line, with a real date and an optional bank.",
        "Multiple recurring incomes via templates, just like expenses: declare salary + collected rent + retainer once and every new month they show up as pending so you can confirm them when the money lands.",
        "Multi-currency with frozen FX: if you get paid in USD and your primary currency is ARS, Clara stores the rate at the time of the payment and shows the converted total without lying.",
        "Tell Clara in chat: \"got $250 from a freelance gig\", \"my salary just landed\", \"received the bonus\" — she records the line for the current month, dedupes if it was already there and confirms.",
        "New /incomes page to view and edit your income templates, mirror of the expenses templates page.",
      ],
    },
    {
      version: "0.5.0",
      date: "2026-05-01",
      title: "Savings: a global pile with full ledger and integration",
      highlights: [
        "New /savings page: live balance, manual deposits and withdrawals, plus system movements (monthly contribution, end-of-month leftover, debt coverage) explained one by one.",
        "Each month you can register an informational monthly contribution: it adds to your savings and stays linked to that month, but does not touch the month balance and does not appear as an expense.",
        "If last month closed in deficit, Clara now asks before opening the new one: cover all (or what fits) from your savings, or carry the debt over. No surprises.",
        "Available everywhere: chat agent and MCP can read your savings, add manual movements, set the monthly contribution, and cover debt from savings.",
      ],
    },
    {
      version: "0.4.2",
      date: "2026-05-01",
      title: "Email env vars aligned with trefolio",
      highlights: [
        "Clara now reads `APP_BASE_URL` and `APP_SESSION_SECRET` in addition to `NEXT_PUBLIC_APP_URL` / `NEXTAUTH_SECRET`. If you self-host Clara alongside trefolio you can reuse the same variables without renaming anything.",
        "Verification emails still go out via Resend using the same `RESEND_API_KEY` and `RESEND_FROM_ADDRESS` you already configured for trefolio.",
        "The equivalence is documented in `.env.example` so spinning up a new deploy is copy-paste.",
      ],
    },
    {
      version: "0.4.1",
      date: "2026-05-01",
      title: "Passkeys + show-password toggle",
      highlights: [
        "Sign in with a passkey: fingerprint, Face ID or USB key. Faster and safer than a password — nothing to type.",
        "Create, rename and delete passkeys from Settings. Each user can have several (laptop, phone, hardware key).",
        "Password inputs on login, sign-up and settings now have an eye toggle to show/hide what you typed.",
      ],
    },
    {
      version: "0.4.0",
      date: "2026-05-01",
      title: "Telegram front and centre + captcha and verified email on login",
      highlights: [
        "Telegram is now a top-tier feature on the home page: Clara understands photos, voice notes and text on Telegram with the same brain and quota as the web app.",
        "Email/password sign-up and login now go through Cloudflare Turnstile (invisible captcha) to keep bots out.",
        "On sign-up we send a signed link (JWT, expires in 24h) via Resend; you have to verify your email before you can sign in with a password.",
        "Google sign-in is unchanged: if Google already marks the email as verified, no extra step.",
      ],
    },
    {
      version: "0.3.3",
      date: "2026-05-01",
      title: "Build: Stripe API version matches the installed SDK",
      highlights: [
        "The Stripe client again pins the API version typed by the installed npm package so Vercel production builds pass typecheck.",
      ],
    },
    {
      version: "0.3.2",
      date: "2026-05-01",
      title: "Telegram: long replies and charts no longer abort the send",
      highlights: [
        "HTML chunks no longer split mid-<b>…</b>, which made Telegram reject the whole outbound reply with a parse error.",
        "If HTML still fails to parse, we retry that chunk as plain text so the rest of the reply can go through.",
        "If a chart image URL fails, we log and continue with the text instead of failing the entire response.",
      ],
    },
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
        "Clara only stores what's necessary to work as an expense tracker: your email, the banks you register, the templates and lines you create, the chat messages (web and Telegram), your savings pile and its movements, and, if you link Telegram, your Telegram user id to route messages.",
        "If you use the version hosted by Trefolio, the data lives in a managed Postgres database in Europe. If you self-host, it lives wherever you put it.",
      ],
    },
    {
      heading: "What Clara does NOT do",
      body: [
        "No telemetry: we don't measure clicks, sessions or usage events for analytics.",
        "No data sales to third parties and no monetization of your information.",
        "No model training with your data: we use Vercel AI Gateway with zero data retention for every LLM call.",
        "Never has access to your money: Clara only processes files or messages you explicitly share with her.",
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
      heading: "Captcha and email verification",
      body: [
        "Sign-up and email/password sign-in run through Cloudflare Turnstile (Cloudflare, Inc.) to keep bots out. Cloudflare receives the IP and browser metadata needed to evaluate the challenge; we never send your email or password to Cloudflare. If you self-host Clara without Turnstile keys configured, that layer disables itself.",
        "When you sign up, we send a signed verification link (expires in 24h) through Resend (Resend, Inc.). The link only proves the email is yours; we never share your password or balance data with Resend. You have to confirm the email before you can sign in with a password. Google sign-in is unchanged: if Google already marks your email as verified, no extra step.",
      ],
    },
    {
      heading: "Your rights",
      body: [
        "You can export all your data via the API or ask us for a full dump. You can delete your account from Settings; when you do, we cascade-delete all your information (expenses, months, Telegram messages, MCP tokens).",
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
