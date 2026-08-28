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
export type TermsSection = { heading: string; body: string[] };

/**
 * Strings for the public contact form at `/contact`. The page itself is a
 * client island for Turnstile; copy lives here so it stays alongside the
 * legal docs.
 */
export type ContactCopy = {
  metaTitle: string;
  metaDescription: string;
  chip: string;
  title1: string;
  titleHighlight: string;
  titleSuffix: string;
  intro: string;
  privacyHint: string;
  kindLabel: string;
  kindOptions: { value: "PRIVACY" | "ABUSE" | "BUG" | "GENERAL"; label: string; description: string }[];
  nameLabel: string;
  emailLabel: string;
  bodyLabel: string;
  bodyPlaceholder: string;
  submit: string;
  submitting: string;
  successTitle: string;
  successBody: string;
  errorGeneric: string;
};

export type LocalisedMarketingContent = {
  HERO_PITCH: string;
  ELEVATOR_PITCH: string;
  FEATURES: MarketingFeature[];
  FAQ: MarketingFaq[];
  CHANGELOG: ChangelogEntry[];
  PRIVACY_SECTIONS: PrivacySection[];
  TERMS_SECTIONS: TermsSection[];
  CONTACT_COPY: ContactCopy;
};

const ES: LocalisedMarketingContent = {
  HERO_PITCH:
    "Hablale en castellano, mandale el PDF del banco o dictale una nota de voz desde Telegram. Clara entiende, categoriza y mantiene tu balance al día. Less drama, more done.",
  ELEVATOR_PITCH:
    "Chat-first expense tracker con personalidad. Open source, MIT, self-hostable. Sin telemetría, sin precio por usuario, hablando rioplatense.",
  FEATURES: [
    {
      emoji: "📊",
      title: "Gastos del mes en tabla",
      description:
        "En desktop, el mes abre como planilla por banco: filtros recurrente/puntual, gráficos, edición al doble click y simulación qué-pasa-si sin tocar tus datos reales.",
    },
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
        "Clara es una asistente financiera con IA: un expense tracker conversacional que entiende fotos del banco, PDFs, CSVs y notas de voz desde el chat web o Telegram. Te ayuda a planificar tus gastos mes a mes, y en desktop también podés ver el mes en planilla por banco.",
    },
    {
      question: "¿Cuánto cuesta?",
      answer:
        "Clara es open source bajo licencia MIT y se puede self-hostear gratis. La versión hosteada por nosotros incluye 30 consultas diarias con la asistente sin pagar nada. Si te queda corto y querés ayudar a mantener la infraestructura, podés subirte al plan Supporter por €7,99 al mes (200 consultas diarias) o hacer un aporte único por el monto que quieras desde el chat. Donación y suscripción son opcionales: el producto sigue siendo gratis para la mayoría de la gente.",
    },
    {
      question: "¿Clara tiene vista tipo planilla / Excel?",
      answer:
        "Sí, en pantallas de escritorio. En el mes (/m/AAAA-MM) la vista por defecto es «Gastos en tabla»: planilla agrupada por banco, con filtros, gráficos y un modo Simular para probar escenarios sin guardar. En el celular seguís con la lista cronológica. Las respuestas de Clara sobre números son informativas y pueden equivocarse; no son asesoramiento financiero.",
    },
    {
      question: "¿Cómo procesa los PDFs y extractos bancarios?",
      answer:
        "Clara usa modelos de lenguaje multimodales vía Vercel AI Gateway para extraer movimientos de PDFs, capturas y CSVs. El procesamiento corre en Vercel Functions: el archivo se sube a Vercel Blob temporalmente, el modelo extrae los datos, y Clara te muestra una propuesta antes de guardar nada en tu base de datos.",
    },
    {
      question: "¿Qué bancos soporta?",
      answer:
        "Cualquier banco del mundo: importás PDFs/CSVs o registrás gastos manualmente vía chat o nota de voz. En Europa, si está habilitado en tu cuenta, también podés conectar el banco por Open Banking (solo lectura, vía Enable Banking). Clara nunca inicia pagos ni mueve plata.",
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
        "Mint, YNAB, Fintonic y similares son planillas con mejor diseño: filas, categorías y reportes. Clara es chat-first: hablás con ella en lenguaje normal, le mandás un PDF y entiende, le mandás una nota de voz y registra el gasto. Cuando querés la planilla del mes, también la tenés en desktop. La IA es el núcleo del producto, no una feature de marketing. Y es open source.",
    },
  ],
  CHANGELOG: [
    {
      version: "0.19.0",
      date: "2026-08-28",
      title: "Clover y Warren te preguntan a vos",
      highlights: [
        "Si le hablás a Clover o Warren de gastos, caja o ahorros, ahora te consultan a Clara de verdad — no solo un resumen de la pila.",
        "Cuenta contra el cupo de trefolio, no contra tu tope diario de Clara.",
        "Si todavía no tenés cuenta en Clara, te proponen crearla con el mismo login.",
      ],
    },
    {
      version: "0.18.1",
      date: "2026-08-26",
      title: "Warren mira tu caja del mes",
      highlights: [
        "Si hablás de inversiones, Clara le pasa la pregunta a Warren sí o sí.",
        "Warren cruza tu cartera con cómo viene el mes (gastos, sobrante, qué día es) y te dice si la caja da, sin decirte qué comprar.",
        "Siempre aclara que no es un asesor y que esto no es recomendación de inversión.",
      ],
    },
    {
      version: "0.18.0",
      date: "2026-08-26",
      title: "Clara consulta a Warren",
      highlights: [
        "Si le pedís tus inversiones o que hable con Warren, Clara consulta tu cartera en trefolio y te resume lo que hay.",
        "Si todavía no tenés cuenta en trefolio, te pasa el link para crearla: https://trefolio.com/signup",
        "Cuenta contra tu cupo diario de Clara, no contra el de Warren en trefolio.",
      ],
    },
    {
      version: "0.17.0",
      date: "2026-08-25",
      title: "Sesiones de chat con memoria",
      highlights: [
        "Cada vez que abrís el chat arrancás con pantalla vacía; la charla igual queda guardada por sesión.",
        "Al salir (cerrar pestaña, irte de la app o 30 min sin escribir), Clara resume la sesión y usa ese resumen la próxima vez.",
        "Podés ver conversaciones guardadas desde el botón en la pantalla de bienvenida.",
      ],
    },
    {
      version: "0.16.1",
      date: "2026-08-25",
      title: "Widget recurrente a pedido",
      highlights: [
        "Si pedís «marcá como recurrentes» o «revisar los recurrentes» sin subir PDF, Clara abre el checklist con los gastos sueltos del mes.",
        "Ya no hace falta que el agente arme la lista a mano ni que venga de una importación.",
      ],
    },
    {
      version: "0.16.0",
      date: "2026-08-25",
      title: "Widget de gastos recurrentes",
      highlights: [
        "Después de un extracto (o si pedís «estos son recurrentes»), Clara te muestra un checklist para marcar qué se convierte en plantilla.",
        "Confirmás y se crean las plantillas al toque, sin volver a preguntar una por una.",
      ],
    },
    {
      version: "0.15.3",
      date: "2026-08-25",
      title: "Burbujas cortas legibles",
      highlights: [
        "Respuestas cortas como «Sí» ya se leen bien en el chat; la burbuja ya no se aplasta en una pastilla vertical.",
      ],
    },
    {
      version: "0.15.2",
      date: "2026-08-25",
      title: "Importaciones largas de una y chat al final",
      highlights: [
        "Si el extracto está claro, Clara carga todos los movimientos de una (sin preguntar '¿sigo con la siguiente tanda?'); solo frena si tiene dudas reales.",
        "Al abrir el chat volvés a ver el último mensaje abajo, sin scrollear desde arriba.",
      ],
    },
    {
      version: "0.15.1",
      date: "2026-08-24",
      title: "Importación de PDF en producción",
      highlights: [
        "Arreglamos el error interno al subir extractos PDF en el chat (el worker de lectura no llegaba al deploy de Vercel).",
        "Volvé a mandar el PDF: Clara lo lee, te lista los movimientos y evita duplicados al confirmar.",
      ],
    },
    {
      version: "0.15.0",
      date: "2026-08-23",
      title: "Open Banking con Enable Banking",
      highlights: [
        "Conectá tu banco europeo desde Configuración: Clara trae cuentas, saldos y movimientos sola.",
        "Hay un atajo en el chat, el menú, Bancos y el mes para conectar la cuenta e importar sola.",
        "El consentimiento dura hasta 180 días según el banco; cuando vence te pedimos reconectar.",
        "Sandbox y producción restringida (solo tus cuentas) para probar sin contrato.",
      ],
    },
    {
      version: "0.14.4",
      date: "2026-08-11",
      title: "Cambiar el banco al editar una plantilla",
      highlights: [
        "Al editar una plantilla de gasto podés cambiar el banco, no solo el nombre y el monto.",
      ],
    },
    {
      version: "0.14.3",
      date: "2026-08-11",
      title: "Import CSV sin trabarse en billeteras de viaje",
      highlights: [
        "Regla de fecha: si el gasto cae dentro del viaje va a la billetera; si cae afuera, queda suelto (salvo que lo pidas explícitamente).",
        "Si Clara te pega un eventId de un viaje cuya fecha no matchea, el gasto se carga igual como suelto en vez de rechazar toda la tanda.",
        "Si pedís «sin billetera» / «ignorá el viaje», Clara deja de auto-etiquetar esa importación.",
      ],
    },
    {
      version: "0.14.2",
      date: "2026-07-25",
      title: "Vista tabla en la home y SEO",
      highlights: [
        "La landing pública destaca «Gastos en tabla» para quien todavía no entró a la app.",
        "Meta, FAQ, Features y llms.txt mencionan la planilla del mes (desktop) para mejor descubrimiento en buscadores y AIs.",
      ],
    },
    {
      version: "0.14.1",
      date: "2026-07-24",
      title: "Mes más ordenado: submenú y tabla por defecto",
      highlights: [
        "En /m/AAAA-MM la planilla, el resumen, la lista y los ingresos viven en pestañas separadas (sin mezclarse).",
        "En desktop, «Gastos en tabla» es la vista por defecto; el resto queda a un clic en el submenú.",
      ],
    },
    {
      version: "0.14.0",
      date: "2026-07-24",
      title: "Vista tabla del mes (desktop)",
      highlights: [
        "En pantallas anchas podés ver los gastos del mes en planilla agrupada por banco, con filtros recurrente/puntual y gráficos.",
        "Doble click para editar un dato; click para preguntarle a Clara sobre ese número en un chat flotante.",
        "Modo Simular: probá “qué pasa si saco o bajo un gasto” sin tocar tus datos reales.",
      ],
    },
    {
      version: "0.13.0",
      date: "2026-05-31",
      title: "CRUD en cualquier mes y fechas estimadas",
      highlights: [
        "Podés crear, editar y borrar gastos e ingresos en meses pasados, actuales o futuros desde el dashboard, el chat y Telegram; las líneas se agrupan por la fecha real del movimiento.",
        "Si no indicás fecha en el chat, Clara usa hoy y la marca como estimada; en CSV/PDF conserva la fecha del extracto.",
        "El agente actúa con menos confirmaciones en altas claras y mantiene confirmación en importaciones masivas y borrados.",
      ],
    },
    {
      version: "0.12.10",
      date: "2026-05-22",
      title: "Telegram: CSV y PDF como documento",
      highlights: [
        "Podés mandar un export CSV del banco como archivo en Telegram; Clara lo interpreta igual que en el chat web.",
        "Endurecimos la detección de PDF/CSV (incluye octet-stream con extensión .pdf/.csv) para que no caigan en “tipo de archivo no soportado”.",
      ],
    },
    {
      version: "0.12.9",
      date: "2026-05-09",
      title: "Perfil y acceso en user.trefolio.com",
      highlights: [
        "Con la cuenta unificada del IdP, Configuración → Perfil y acceso enlaza el portal /account en user.trefolio.com (nombre, contraseña, Google, passkeys); Preferencias e integraciones siguen en Clara.",
        "El nombre y la foto del perfil se sincronizan desde el IdP junto con el cupo diario.",
      ],
    },
    {
      version: "0.12.8",
      date: "2026-05-09",
      title: "Idioma del IdP alineado con trefolio",
      highlights: [
        "Si venías de trefolio con la cookie `trefolio_ui_locale` (por ejemplo alemán o francés), Clara ahora la usa al abrir user.trefolio.com antes que solo el selector ES/EN local.",
      ],
    },
    {
      version: "0.12.7",
      date: "2026-05-09",
      title: "Suscripción solo en user.trefolio.com",
      highlights: [
        "Configuración → Suscripción ahora solo enlaza la mejora y la gestión de facturación al IdP; desapareció el checkout Stripe Supporter local.",
        "Las donaciones únicas siguen por Stripe en Clara; el webhook de Stripe solo registra donaciones.",
        "El cupo diario se sincroniza desde el IdP en segundo plano (throttle ~60s) para que una baja en Stripe se refleje sin volver a iniciar sesión.",
      ],
    },
    {
      version: "0.12.6",
      date: "2026-05-09",
      title: "Respuestas en el idioma del mensaje",
      highlights: [
        "El agente infiere el idioma principal de tu último mensaje (incluido texto de adjuntos o voz transcrita) y responde en ese idioma; si no alcanza, usa tu preferencia guardada (es/en).",
      ],
    },
    {
      version: "0.12.5",
      date: "2026-05-08",
      title: "Login unificado: vincular cuenta existente",
      highlights: [
        "Si ya tenías usuario en Clara con Google o correo y entrabas por user.trefolio.com, NextAuth cortaba con «cuenta de Google no vinculada». Ahora enlazamos el proveedor trefolio-id al mismo usuario por email, igual que en Will.",
      ],
    },
    {
      version: "0.12.4",
      date: "2026-05-08",
      title: "Login unificado: mismo idioma en user.trefolio.com",
      highlights: [
        "Si Clara estaba en castellano pero el navegador prefería otro idioma, la pantalla de acceso del IdP a veces abría en francés u otro idioma. Ahora mandamos el idioma de la UI de Clara en el parámetro OIDC `ui_locales`, así user.trefolio.com te recibe en el mismo idioma que venías usando.",
      ],
    },
    {
      version: "0.12.3",
      date: "2026-05-08",
      title: "Ajustes: Pro y facturación en user.trefolio.com",
      highlights: [
        "Con la cuenta unificada del IdP, la tarjeta de Suscripción en Configuración ofrece «Pasá a Trefolio Pro» y «Gestionar facturación» apuntando a user.trefolio.com (upgrade y portal de Stripe) en lugar de quedar vacía cuando el upsell viejo de Supporter está apagado.",
        "El modal del tope diario ahora dice explícitamente «Ver planes en user.trefolio.com» en el botón del enlace al IdP.",
      ],
    },
    {
      version: "0.12.2",
      date: "2026-05-06",
      title: "Cuenta unificada de trefolio: Telegram y el tope diario",
      highlights: [
        "Si entrás con la cuenta de user.trefolio.com, guardamos el identificador del IdP y lo usamos para enlazar Telegram también ahí, así el mismo usuario queda mapeado entre productos.",
        "Cuando tocás el tope de mensajes, el modal y Telegram te mandan al upgrade de Trefolio Pro en el IdP; el upsell viejo de Stripe Supporter queda apagado mientras el IdP unificado esté configurado.",
      ],
    },
    {
      version: "0.12.1",
      date: "2026-05-04",
      title: "Compartir un viaje vuelve a funcionar de punta a punta",
      highlights: [
        "Si mandabas el link de un viaje compartido a una amiga, al apretar \"Sumarme por Telegram\" se cortaba con \"No pudimos procesar tu pedido\". El proxy nos estaba pisando el endpoint público y mandando el formulario al login. Ya pasa de largo y la invitación termina como toca: en una conversación nueva con Clara en Telegram.",
        "Y ahora también podés pedirle a Clara que comparta el viaje sin abrir la web: decile \"compartí Málaga con Cyn\" o \"mandame un link del cumple\" y ella mintea uno fresco y te lo pega en el chat para que lo reenvíes. El link vence a los 30 días, igual que el de la web.",
      ],
    },
    {
      version: "0.12.0",
      date: "2026-05-04",
      title: "Clara te cuenta qué está haciendo en Telegram",
      highlights: [
        "Mientras Clara piensa, ahora ves un mensaje cortito que se va actualizando con cada paso: \"Anotando el gasto…\", \"Buscando tus bancos…\", \"Preparando gráfico…\". Sentís que pasa algo en vez de mirar los tres puntitos.",
        "El mensaje desaparece apenas llega la respuesta final, así no te queda ruido en el chat.",
        "Misma idea que ya teníamos en el chat web: ahora Telegram también muestra cada acción a medida que ocurre.",
      ],
    },
    {
      version: "0.11.3",
      date: "2026-05-03",
      title: "Cada gasto guarda el día — y desde una captura, también",
      highlights: [
        "Antes, si le mandabas una captura del banco, Clara podía cargar los movimientos con la fecha de hoy aunque la transacción fuera de hace una semana. Ahora lee la fecha real de cada línea (con día, mes y año) y la guarda como corresponde.",
        "Si en la captura la fecha no se ve, está cortada o es ambigua (\"abr\", \"ayer\", sin año), te pregunta antes de cargar en vez de inventar el día.",
        "Lo mismo aplica a tickets, PDFs y CSVs: la fecha que aparece en el comprobante es la que queda en tu mes, no la del momento en que la cargás.",
      ],
    },
    {
      version: "0.11.2",
      date: "2026-05-03",
      title: "Si Clara se confunde el id del evento, igual te carga el gasto",
      highlights: [
        "Después del fix anterior, el modelo seguía colando el id del banco como si fuera id de evento (un CUID válido pero del namespace equivocado), y volvía a fallar con \"el evento no existe\".",
        "Ahora si el `eventId` no resuelve a un viaje real tuyo, la línea se carga igual como gasto suelto y el agente recibe una nota explicando el error para que no lo repita en el próximo turno.",
        "Misma lógica para `paidByUserId`: si lo que pasa el modelo no es un participante real del viaje, fallback a vos como pagador en vez de bloquear la carga.",
      ],
    },
    {
      version: "0.11.1",
      date: "2026-05-03",
      title: "Cargar gastos por Telegram dejó de fallar por eventos fantasma",
      highlights: [
        "Si pasabas una captura del banco por Telegram y le decías \"sí, cargá\", a veces Clara intentaba pegar cada gasto a un evento inventado (un slash, una coma, el nombre del último viaje) y todo fallaba con \"el evento no existe\".",
        "Ahora el agente solo puede pasar `eventId` y `paidByUserId` reales — el id que devuelve la propia herramienta — y le dijimos en el prompt que si no hay viaje activo, omita el campo en vez de inventar uno.",
      ],
    },
    {
      version: "0.11.0",
      date: "2026-05-02",
      title: "Compartí un viaje y repartan los gastos al cierre",
      highlights: [
        "Las billeteras de evento ahora se comparten: desde el detalle del viaje generás un link y se lo mandás a quien venga. Se puede revocar cuando quieras y, por seguridad, el link en claro solo se ve una vez al generarlo.",
        "Quien abre el link puede sumarse de dos formas: con su cuenta de Clara (un click y el viaje aparece en su panel) o solo por Telegram, sin crear cuenta. En el segundo caso le abrimos una conversación con el bot y queda como invitado del viaje.",
        "Cada gasto del viaje guarda quién pagó. Cuando son varios participantes, Clara te pregunta 'pagaste vos o lo puso Marina?' antes de cargar, así no quedan gastos huérfanos a la hora de repartir.",
        "Vista previa del reparto en vivo: en la pantalla del viaje ves total, parte que toca por cabeza, lo que pagaste vos, tu saldo (te deben / debés) y las transferencias sugeridas. Se actualiza con cada gasto.",
        "Al cerrar el viaje, cada participante recibe por Telegram el resumen exacto: cuánto sale por cabeza, qué pagaste, y cuánto le tenés que pasar a quién (o cobrarle). El organizador absorbe el centavo de redondeo para que las cifras queden limpias.",
        "Si te invitaron solo por Telegram y querés tener cuenta completa después, hay un upgrade en `/upgrade-guest` que te pide email + contraseña y mantiene todo lo que ya cargaste en el viaje.",
      ],
    },
    {
      version: "0.10.0",
      date: "2026-05-02",
      title: "Borrar cuenta con 30 días para arrepentirte",
      highlights: [
        "Cuando pedís borrar la cuenta desde Configuración, ahora queda en cola por 30 días: nada se pierde y, si te arrepentís, iniciás sesión y tocás \"Restaurar mi cuenta\".",
        "Mientras estás en cola: el chat, las APIs y los recordatorios diarios de Telegram quedan en pausa, y tu PAT de MCP deja de funcionar para que ningún cliente AI siga tocando datos que pediste borrar.",
        "Si tenés Supporter activo, lo cancelamos en el momento que apretás borrar — no esperamos a los 30 días, así no se cobra otro mes que no vas a usar.",
        "A los 7 y al último día te avisamos por email para que no te pierdas la ventana de gracia. Si te arrepentiste, el botón te lleva directo a recuperar la cuenta.",
        "Si lo querés borrar definitivamente sin esperar, hay una opción explícita: marcás \"Saltarse la gracia\" en el formulario y eliminamos todo al instante.",
        "Pasados los 30 días, una limpieza diaria borra todo en cascada: bancos, plantillas, gastos, mensajes, ahorros, tokens MCP y passkeys. La política de privacidad y los términos suben a 1.1 con este cambio.",
      ],
    },
    {
      version: "0.9.0",
      date: "2026-05-02",
      title: "Recordatorios diarios por Telegram",
      highlights: [
        "Si durante el día no cargaste nada, Clara te escribe por Telegram a las 20:00 de tu zona horaria para preguntarte si tenés algún ingreso o gasto para registrar.",
        "Se activa solo para usuarios con Telegram vinculado y se apaga con un switch en Configuración → Integraciones → Telegram.",
        "Los mensajes los redacta Clara con IA pero no gastan tu cupo diario de consultas: son mensajes iniciados por el sistema, no por vos.",
        "Respeta tu país: la zona horaria se infiere del que elegiste en el onboarding; si no hay match, el recordatorio sale a las 20:00 UTC.",
      ],
    },
    {
      version: "0.8.1",
      date: "2026-05-02",
      title: "Telegram volvió a responder",
      highlights: [
        "Arreglamos un bug que dejaba a Clara muda en Telegram: el webhook tiraba 500 en cada mensaje (texto, foto o nota de voz) por una librería de PDF que se cargaba donde no debía. Ya está resuelto.",
      ],
    },
    {
      version: "0.8.0",
      date: "2026-05-02",
      title: "Billeteras de evento — agrupá los gastos de un viaje en una sola línea",
      highlights: [
        "Armá una billetera para tu próximo viaje (o casamiento, cumple, evento puntual) con un nombre y un rango de fechas. Mientras esté abierta, los gastos siguen viviendo en su mes real, pero el dashboard los agrupa en una sola fila colapsable con el total.",
        "Clara detecta que estás de viaje: cuando cargás un gasto cuya fecha cae adentro del rango del evento, lo suma automáticamente y te avisa el total acumulado. Si la descripción no pega (Spotify, alquiler), te pregunta antes de etiquetarlo.",
        "Al cerrar el evento elegís cómo imputar la plata: 'todo a un mes' (default — ideal para viajes que cruzan meses) o 'cada gasto en su mes real'. Si después necesitás reabrirlo, los gastos vuelven a sus meses originales sin perder nada.",
        "Cobertura completa: agente y MCP exponen las nuevas herramientas (`createEvent`, `closeEvent`, `attachExpenseToEvent`, etc.), todas con confirmación explícita en MCP cuando mueven datos.",
        "Paridad UI: todo lo del chat se hace también con clicks. En cada fila del mes hay un menú para etiquetar o sacar de un evento al toque. Desde la página de la billetera tenés 'Sumar gastos' para enganchar varios gastos sueltos juntos, y editás nombre, fechas y color sin pasar por la consola.",
      ],
    },
    {
      version: "0.7.4",
      date: "2026-05-01",
      title: "Lanzamiento LinkedIn: MCP endurecido, Telegram + PDF, i18n técnica",
      highlights: [
        "MCP per-user: rate limit por usuario (Upstash) + borrados con `confirm: true` alineados al chat.",
        "MCP público: `?lang=es|en` / Accept-Language y `serverInfo.version` tomada del changelog.",
        "Telegram: documentos PDF (texto + páginas raster), comandos `/` registrados por idioma (en/es).",
        "Tokens de API: prefijo `clara_pat_` (se acepta `ada_pat_` legacy). README, diagrama Mermaid y screenshots en `public/screenshots/`.",
        "CI: Postgres de servicio para que `prisma migrate diff` falle el PR si hay drift de migraciones.",
        "Errores de API, tools del agente y tests anti-drift de español en capa API/AI para usuarios en inglés.",
      ],
    },
    {
      version: "0.7.3",
      date: "2026-05-01",
      title: "Clara limpia movimientos duplicados de la pila de ahorros",
      highlights: [
        "Decile 'borrá los movimientos duplicados de mis ahorros' y Clara primero te muestra los grupos detectados (mismo tipo, monto, moneda, fecha y nota) para que confirmes antes de tocar nada.",
        "Cuando confirmás, borra todos los extras de cada grupo en una sola transacción, conserva el más antiguo y reajusta la pila — sin riesgo de quedar descuadrada.",
        "Solo afecta movimientos manuales (`MANUAL_DEPOSIT`/`MANUAL_WITHDRAWAL`). Los del sistema (aporte mensual, cobertura de deuda, derivación de sobrante) ya tienen unicidad por mes y se ignoran.",
      ],
    },
    {
      version: "0.7.2",
      date: "2026-05-01",
      title: "Telegram te recibe con una guía paso a paso",
      highlights: [
        "Cuando vinculás Telegram por primera vez, Clara genera la bienvenida con IA: te saluda, te pregunta si arrancás por un ingreso o un gasto y te tira 3-4 ejemplos para que toques o reescribas.",
        "Mientras la cuenta no esté seteada (sin moneda confirmada o sin movimientos del mes), cada turno te empuja amablemente al siguiente paso usando las mismas tools que ya conocés (addIncomeLine, addMonthLine, setPrimaryCurrency).",
        "Si ya tenías la cuenta lista por la web, el saludo estático y el menú inline siguen igual — la guía solo aparece cuando hace falta.",
      ],
    },
    {
      version: "0.7.1",
      date: "2026-05-01",
      title: "Clara también borra y resta de tus ahorros desde el chat",
      highlights: [
        "Decile 'borrá ese movimiento de ahorros' o 'sacá el depósito que cargué mal' y Clara lo borra del ledger (solo movimientos manuales — los del sistema se deshacen rehaciendo la decisión del mes).",
        "'Restale 50 a la pila' o 'saqué 200 de los ahorros' ahora dispara un retiro manual sin que tengas que ir a la página de ahorros.",
        "Mismo poder desde MCP: cualquier cliente AI tuyo puede listar la pila, sumar, restar y borrar movimientos manuales con tu permiso.",
      ],
    },
    {
      version: "0.7.0",
      date: "2026-05-01",
      title: "Cumplimiento GDPR: consentimiento, exportación, borrado y contacto",
      highlights: [
        "Política de privacidad y términos reescritos al detalle (Art. 13 GDPR): bases legales por dato, sub-procesadores con país, transferencias internacionales con SCC, retenciones numéricas y tus derechos uno por uno.",
        "Aceptación demostrable: ahora guardamos `acceptedTermsAt` y la versión exacta que firmaste. Si cambian materialmente los términos te pedimos re-aceptar antes de seguir, sin trampas.",
        "Settings → Tu información: descargá un dump JSON con todo lo que tenemos de vos (Art. 15) y borrá tu cuenta cuando quieras (Art. 17), con re-autenticación y cancelación automática de Stripe.",
        "Canal público de contacto: nuevo formulario en /contact con captcha de Cloudflare, sin exponer ningún email personal del responsable.",
        "Bandeja /admin/contact para que el equipo gestione consultas de privacidad, abuso, bugs y soporte con marcado de leído / respondido / archivado.",
      ],
    },
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
      heading: "1. Quién es Clara y quién es responsable de tus datos",
      body: [
        "Clara es una asistente financiera con IA, open source bajo licencia MIT y self-hosteable. Esta política aplica a la versión hosteada en clara.trefolio.com.",
        "El responsable del tratamiento (data controller) es Marcos Suarez, mantenedor de Clara como proyecto personal open source. Si self-hosteás Clara en tu propia infraestructura, el responsable sos vos (o tu organización), no nosotros.",
        "Para ejercer cualquier derecho o consulta de privacidad, usá el formulario público en /contact eligiendo el motivo \"Privacidad / GDPR\". No publicamos un email personal — el formulario va a la bandeja del responsable y respondemos por la dirección que dejes ahí.",
      ],
    },
    {
      heading: "2. Qué datos recolectamos",
      body: [
        "Cuenta y autenticación: email, contraseña hasheada (bcrypt), nombre y avatar opcionales sincronizados desde Google si entrás con Google, marca de email verificado, passkeys (WebAuthn) que registres, idioma preferido, país declarado en el onboarding.",
        "Tipo de cuenta (`User.kind`): por defecto REGULAR. Si entraste a Clara aceptando la invitación a un viaje compartido sin crear cuenta, tu cuenta es GUEST: solo tiene tu nombre de pantalla, el chat de Telegram vinculado y acceso a ese único viaje. No tiene contraseña, ni email obligatorio, ni acceso al panel ni a tus propios meses; podés convertirla en REGULAR en cualquier momento desde /upgrade-guest.",
        "Datos financieros: bancos que registres, plantillas de gastos e ingresos, líneas mensuales (monto, descripción, categoría, fecha, moneda, tipo de cambio congelado), y, en gastos cargados dentro de una billetera de evento compartida, qué participante pagó esa línea (`paidByUserId`); pila global de ahorro y su ledger de movimientos, instrucciones para el agente.",
        "Open Banking (opt-in): si conectás un banco europeo vía Enable Banking, guardamos el identificador de sesión cifrado, el nombre del banco, país, fecha de vencimiento del consentimiento, cuentas linkeadas (IBAN enmascarado) y un registro de los movimientos importados. Los logs de API de admin no guardan IBANs ni descripciones.",
        "Billeteras de evento compartidas: si invitás a alguien a un viaje vía un share-link, guardamos por cada participante su nombre de pantalla a nivel evento, su rol (organizador o invitado) y, en el caso de invitados nuevos por Telegram, un código de un solo uso para vincular el bot. Los share-links se guardan como hash sha256 — nunca el link en claro — y los podés revocar desde la pantalla del viaje cuando quieras; revocación, expiración y último uso son visibles para vos.",
        "Conversaciones: mensajes del chat web (texto + adjuntos como JSON estructurado), mensajes de Telegram si vinculás el bot, contadores de uso del agente y modelos consumidos por día.",
        "Consulta a Warren (opt-in por mensaje): si le pedís a Clara tus inversiones o que hable con Warren, Clara envía tu identificador de cuenta unificada (IdP `sub` y email), la pregunta y un resumen agregado del mes en curso (ingresos, gastos planificados/pagados, balance, pila de ahorro, día del mes) — no el detalle de cada gasto — a trefolio (misma organización) para que Warren cruce caja con cartera. Si self-hosteás, esto se desactiva cuando no configurás `TREFOLIO_BASE_URL`.",
        "Preferencia de recordatorios por Telegram y fecha del último recordatorio enviado (solo aplica si tenés Telegram vinculado; se usa para no mandarte más de un mensaje por día y para que puedas apagarlos cuando quieras desde Configuración).",
        "Pagos (sólo si te suscribís o donás): identificador de cliente de Stripe, estado de la suscripción y fecha de fin de periodo, registro de cada donación (id de Stripe, monto, fecha).",
        "Tokens de acceso para AI (MCP): nombre, prefijo de 12 caracteres, fecha de creación, último uso, expiración y revocación. El token completo se hashea con SHA-256 antes de guardarlo; el plaintext sólo se muestra una vez.",
        "Metadatos técnicos mínimos: IP truncada y user-agent en logs de error y rate-limit (sin perfilado), última fecha de actividad, día de actividad para DAU/WAU.",
        "Si self-hosteás, los datos viven en la base que vos configures.",
      ],
    },
    {
      heading: "3. Para qué los usamos y con qué base legal (Art. 6 GDPR)",
      body: [
        "Ejecución del contrato (Art. 6(1)(b)): operar la cuenta, persistir tus gastos, ingresos y mensajes, procesar PDFs/audios/screenshots que vos nos mandás, ejecutar el agente con tus tools, consultar a Warren en trefolio cuando vos lo pedís, cobrar la suscripción Supporter o donaciones que elijas hacer.",
        "Obligación legal (Art. 6(1)(c)): conservar registros de pagos y donaciones por el plazo que exija la normativa fiscal aplicable, verificar el email antes de habilitar contraseña.",
        "Interés legítimo (Art. 6(1)(f)): proteger Clara y sus usuarios contra abuso (Cloudflare Turnstile, rate-limits con IP), monitorear errores (Sentry si está configurado), auditar accesos administrativos.",
        "Consentimiento (Art. 6(1)(a)): aceptación explícita de estos Términos y esta Política al registrarte (queda guardada en `User.acceptedTermsAt` con la versión). Vincular Telegram es en sí mismo una acción voluntaria que activa el canal bidireccional con el bot — incluidos los recordatorios diarios proactivos que Clara te manda a las 20:00 locales si en el día no cargaste nada. Podés apagarlos en cualquier momento desde Configuración → Integraciones → Telegram, sin perder el vínculo con el bot. Conectar un banco vía Open Banking es otro consentimiento explícito (PSD2): Clara solo lee cuentas, saldos y movimientos; nunca inicia pagos. Podés desconectar en cualquier momento desde Configuración.",
        "Nunca vendemos datos. Nunca corremos analytics de comportamiento. Nunca usamos tus datos financieros para entrenar modelos.",
      ],
    },
    {
      heading: "4. Sub-encargados de tratamiento",
      body: [
        "Vercel Inc. (US) — hosting de la aplicación, base Postgres administrada (vía Marketplace), Vercel Blob para audios TTS, Vercel Runtime Cache, AI Gateway que enruta llamadas a modelos. Recibe todos los datos persistidos como infraestructura.",
        "OpenAI (US) — Whisper para transcripción de notas de voz, OpenAI TTS para audio de respuesta, GPT-* a través del AI Gateway. Bajo política de zero data retention.",
        "Anthropic (US) y Google (US) — proveedores adicionales de modelos enrutados por AI Gateway cuando aplique, también con ZDR.",
        "Cloudflare Inc. (US) — Turnstile (captcha) en signup y login. Recibe IP y metadatos del navegador para evaluar el desafío; no recibe email, contraseña ni datos financieros.",
        "Resend Inc. (US) — emails transaccionales (verificación de email, alertas). Recibe sólo tu email y el contenido del mensaje, no datos del balance.",
        "Stripe Inc. / Stripe Payments Europe Ltd (US/IE) — procesamiento de pagos si elegís suscribirte o donar. Recibe email, país, datos de la tarjeta. Clara nunca ve el número de tarjeta.",
        "Upstash Inc. (US) — Redis para rate-limits. Recibe IP y contadores; no contenido de los mensajes.",
        "Telegram FZ-LLC (AE) — Bot API, sólo si linkeás Telegram. Recibe los mensajes que vos enviás al bot.",
        "Enable Banking Oy (FI) — Open Banking / PSD2, sólo si conectás un banco desde Configuración. Recibe el flujo de autorización con tu banco y, con tu consentimiento, cuentas, saldos y movimientos. Clara nunca inicia pagos.",
        "Google LLC (US) — OAuth 2.0, sólo si elegís entrar con Google. Recibe el flujo de autenticación estándar.",
        "Sentry GmbH (DE) — agregación de errores, sólo si el operador configuró `SENTRY_DSN`. Recibe stack traces y contexto técnico, sin payloads de mensajes.",
        "Cuando self-hosteás, vos elegís qué sub-encargados usar (todos son opcionales y degradan con gracia).",
      ],
    },
    {
      heading: "5. Transferencias internacionales",
      body: [
        "Varios sub-encargados están en Estados Unidos o en jurisdicciones fuera del EEE. Cuando aplica, las transferencias se cubren con Cláusulas Contractuales Tipo (SCCs, Decisión EU 2021/914) y, donde el procesador esté certificado, con el EU-US Data Privacy Framework. Telegram FZ-LLC opera desde Emiratos Árabes Unidos; los datos sólo se le envían si vos linkeás el bot.",
      ],
    },
    {
      heading: "6. Plazos de retención",
      body: [
        "Cuenta y datos financieros: hasta que borres la cuenta. Cuando pedís borrarla queda en una cola de 30 días en la que podés recuperarla con un click; pasados los 30 días, el borrado es definitivo y en cascada.",
        "Audios TTS en Vercel Blob: hasta 7 días.",
        "Logs de aplicación (Vercel/Sentry): 30 días.",
        "Idempotencia de webhooks de Stripe: 18 meses.",
        "Recibos de donaciones y suscripciones: 7 años (obligación fiscal en la UE).",
        "Tokens MCP: hasta que los revoques; revocados se purgan a los 30 días.",
        "Tokens de share-link de eventos compartidos: hasta el momento de expiración o revocación; revocados o expirados se purgan a los 30 días. Las cuentas de invitado (User.kind = GUEST) creadas a partir de uno de esos links siguen las reglas generales: viven mientras vos no las borres, o se purgan en cascada cuando el organizador del viaje borra el evento o su propia cuenta.",
        "Mensajes del chat (web y Telegram): hasta que borres la cuenta o le pidas al agente que los purgue.",
        "Mensajes del formulario /contact: 24 meses; los metadatos técnicos (IP / user-agent del envío) máx 90 días o hasta que se archive el mensaje, lo que ocurra primero.",
        "Open Banking: la conexión, las cuentas linkeadas y los movimientos importados viven con la cuenta (o hasta que desconectes el banco). Los logs de API de admin se purgan a los 30 días.",
      ],
    },
    {
      heading: "7. Tus derechos",
      body: [
        "Acceso (Art. 15): descargate todos tus datos en JSON desde Configuración → Tu información y cuenta.",
        "Portabilidad (Art. 20): el JSON anterior es estructurado y machine-readable.",
        "Supresión / derecho al olvido (Art. 17): borrá tu cuenta desde Configuración. Queda en cola por 30 días en los que podés revertirla iniciando sesión y tocando \"Restaurar mi cuenta\"; pasado ese plazo, el borrado es definitivo y en cascada. Las donaciones quedan en Stripe por obligaciones fiscales.",
        "Rectificación (Art. 16), restricción (Art. 18), oposición (Art. 21) y retiro de consentimiento (Art. 7(3)): mandanos un mensaje desde /contact eligiendo \"Privacidad / GDPR\". Respondemos en un máximo de 30 días.",
      ],
    },
    {
      heading: "8. Derecho a presentar una queja",
      body: [
        "Tenés derecho a reclamar ante la autoridad de control de tu país de residencia: AEPD en España, CNIL en Francia, Garante per la Privacy en Italia, BfDI en Alemania, AAIP en Argentina, etc. La lista de autoridades europeas vive en https://edpb.europa.eu/.",
      ],
    },
    {
      heading: "9. Visibilidad dentro de un viaje compartido",
      body: [
        "Cuando aceptás un share-link de un viaje, los demás participantes (incluido el organizador) ven tu nombre de pantalla y, por cada gasto que cargues dentro del viaje, los datos de esa línea (fecha, descripción, monto en la moneda del organizador y categoría). No ven nada del resto de tu cuenta: ni tus otros gastos, ni tu balance, ni tu identidad real más allá del nombre que vos elegiste al sumarte.",
        "Si te invitaron solo por Telegram (cuenta GUEST), tu identidad de Telegram (id de usuario) queda vinculada a esa cuenta para que el bot sepa que sos vos. Esa identidad NO se le muestra a los demás participantes — ellos ven solo tu nombre de pantalla.",
        "El organizador puede quitarte del viaje en cualquier momento. Tus líneas ya cargadas quedan en el viaje (si las borrás, las borrás vos antes de que te quite); a partir del retiro no podés cargar más.",
        "Si borrás tu cuenta GUEST, los gastos que cargaste para el viaje siguen viviendo en la billetera del organizador (las cargaste en su libro contable como parte del viaje compartido); deja de aparecer tu nombre y el reparto se recalcula sin vos.",
      ],
    },
    {
      heading: "10. Cookies estrictamente necesarias",
      body: [
        "Sólo usamos dos cookies, ambas necesarias para el funcionamiento de Clara y exentas de consentimiento previo según la directiva ePrivacy:",
        "`next-auth.session-token` (JWT firmado, 30 días, HttpOnly Secure SameSite=Lax) — mantiene tu sesión iniciada.",
        "`NEXT_LOCALE` (1 año, SameSite=Lax) — recuerda tu idioma preferido para que el server-render arranque en el idioma correcto sin parpadeo.",
        "No cargamos analytics, no usamos pixels publicitarios, no hacemos fingerprinting.",
      ],
    },
    {
      heading: "11. Edad mínima",
      body: [
        "Clara está pensada para personas de 16 años o más. En la Unión Europea Art. 8 GDPR fija ese umbral por defecto; en jurisdicciones donde el umbral aplicable sea menor, hace falta consentimiento parental verificable. Si descubrimos que abrimos una cuenta de un menor de edad sin ese consentimiento, la borramos.",
      ],
    },
    {
      heading: "12. Notificación de brechas de seguridad",
      body: [
        "Si una brecha afecta a tus datos personales con riesgo razonable, te avisamos por email lo antes posible y siempre dentro de las 72 horas que exige el Art. 33-34 GDPR, y reportamos a la autoridad de control cuando aplica.",
      ],
    },
    {
      heading: "13. Cambios a esta política",
      body: [
        "Cuando cambiamos esta política de forma material, bumpeamos `CURRENT_PRIVACY_VERSION` y te pedimos que aceptes la nueva versión la próxima vez que entres. Cambios menores (correcciones de redacción, links rotos) no fuerzan re-aceptación.",
      ],
    },
    {
      heading: "14. Contacto",
      body: [
        "Para cualquier consulta o ejercicio de derechos: usá el formulario en /contact, motivo \"Privacidad / GDPR\". El controlador es persona física, no hay DPO formal.",
      ],
    },
  ],
  TERMS_SECTIONS: [
    {
      heading: "1. Quién provee Clara",
      body: [
        "Clara es una asistente financiera con IA mantenida por Marcos Suarez como proyecto personal, distribuida bajo licencia MIT y self-hosteable. Estos Términos rigen el uso de la versión hosteada en clara.trefolio.com. Si self-hosteás Clara, las condiciones aplican entre vos y los usuarios que vos hospedes; nosotros no somos parte.",
        "Estos Términos forman un acuerdo legal con vos. Si no estás de acuerdo, no uses Clara.",
      ],
    },
    {
      heading: "2. Cuenta y elegibilidad",
      body: [
        "Necesitás 16 años o más (o el mínimo de tu jurisdicción si es mayor). Sos responsable de la información que cargues y de mantener tus credenciales seguras.",
        "Una cuenta = una persona. Cuentas duplicadas para evadir cuotas son motivo de suspensión.",
        "Podés borrar tu cuenta cuando quieras desde Configuración → Tu información y cuenta.",
      ],
    },
    {
      heading: "3. Uso aceptable",
      body: [
        "No usar Clara para actividades ilegales, fraude, lavado de dinero, evasión fiscal o suplantación.",
        "No automatizar la app más allá de las herramientas que ofrecemos (MCP per-user con tu PAT, API documentada). En particular, prohibido el scraping del bot de Telegram, el reverse engineering de los endpoints internos y el bypass de los rate-limits.",
        "No usar Clara para almacenar datos sensibles de terceros sin su consentimiento (datos de salud ajenos, etc.).",
        "Si compartís un viaje vía share-link, sos responsable de invitar solo a personas que estén de acuerdo en participar y de mostrarles, antes de aceptar, los términos públicos del viaje (de qué se trata y por qué necesitás su nombre y, opcionalmente, su Telegram).",
      ],
    },
    {
      heading: "4. Suscripción Supporter y donaciones",
      body: [
        "Clara es gratis para uso personal con un cupo diario de mensajes al agente. La suscripción Supporter (€2,99 / €7,99 según tier) levanta ese cupo y te identifica como sponsor del proyecto. Las donaciones son aportes únicos opcionales.",
        "Pagos procesados por Stripe (Stripe Inc. / Stripe Payments Europe Ltd). Renovación mensual automática salvo que canceles desde Configuración → Suscripción.",
        "Las donaciones son no reembolsables. Las suscripciones cobradas se reembolsan a discreción si el cobro fue por error claro nuestro.",
        "Si cambiamos los precios, te avisamos con al menos 30 días de antelación; podés cancelar antes de que aplique.",
      ],
    },
    {
      heading: "5. Tu contenido",
      body: [
        "Tus extractos, mensajes, fotos del banco y datos financieros son tuyos. Vos retenés todos los derechos.",
        "Nos das una licencia limitada para procesar ese contenido sólo en la medida necesaria para entregarte el servicio (mostrarlo en la UI, mandarlo a los modelos vía AI Gateway con ZDR, mostrártelo en otros dispositivos donde estés logueado).",
        "Si conectás un banco vía Open Banking, autorizás a Clara a leer cuentas, saldos y movimientos e importarlos automáticamente. Clara nunca inicia pagos. Podés desconectar cuando quieras; los movimientos ya importados se quedan en tu cuenta.",
        "Nunca usamos tu contenido para entrenar modelos. Nunca lo vendemos.",
      ],
    },
    {
      heading: "6. Garantías y limitación de responsabilidad",
      body: [
        "Clara NO es una asesora financiera, ni una entidad regulada, ni una contadora. La información que muestra es para tu organización personal; las decisiones de inversión, fiscales o crediticias son tuyas y, si son importantes, consultá a un profesional.",
        "El servicio se presta \"AS-IS\" y \"AS AVAILABLE\". No garantizamos disponibilidad ininterrumpida, ausencia de errores, ni que la IA acierte siempre — el agente confirma antes de mutar tu base de datos justamente por eso. La excepción es Open Banking: al conectar un banco autorizás el auto-import en cada sync.",
        "Hasta donde lo permita la ley aplicable: nuestra responsabilidad agregada por cualquier reclamo se limita al mayor entre (a) los importes que nos pagaste en los últimos 12 meses y (b) cero. No respondemos por daños indirectos, lucro cesante, ni pérdida de datos cuando el self-host está bajo tu control.",
      ],
    },
    {
      heading: "7. Indemnización",
      body: [
        "Vos nos indemnizás contra reclamos de terceros que surjan de tu uso indebido de Clara, contenido tuyo que viole derechos de terceros, o violación de estos Términos. La indemnización está limitada a daños directos razonables y no aplica a violaciones causadas por nosotros.",
      ],
    },
    {
      heading: "8. Suspensión y terminación",
      body: [
        "Vos podés borrar tu cuenta cuando quieras (Configuración → Tu información y cuenta).",
        "Podemos suspender o terminar cuentas que violen estos Términos, atenten contra otros usuarios, abusen del servicio, o representen un riesgo legal para el proyecto. Cuando sea posible te avisamos antes; cuando no (abuso flagrante, requerimiento legal), después.",
      ],
    },
    {
      heading: "9. Cambios al servicio y a estos Términos",
      body: [
        "Clara evoluciona. Podemos cambiar features, precios y estos Términos. Los cambios materiales a los Términos disparan re-aceptación: la próxima vez que entres te pedimos que confirmes la nueva versión antes de seguir usando el servicio. Cambios menores (typos, links) no.",
      ],
    },
    {
      heading: "10. Ley aplicable y jurisdicción",
      body: [
        "Estos Términos se rigen por la ley española y, donde corresponda como consumidor en la UE, por la ley de tu país de residencia. Cualquier disputa se resuelve ante los tribunales del domicilio del consumidor cuando la normativa de consumidor lo exija; en otro caso, los tribunales de Madrid, España.",
      ],
    },
    {
      heading: "11. Contacto",
      body: [
        "Para reportes de bugs, abusos o cualquier consulta: formulario público en /contact. Para issues técnicos open source también podés abrir un issue en https://github.com/kyberis/etracker (ojo: lo que abras ahí es público).",
      ],
    },
  ],
  CONTACT_COPY: {
    metaTitle: "Contacto",
    metaDescription:
      "Escribinos sobre Clara: privacidad y derechos GDPR, abuso o seguridad, bugs o cualquier otra consulta. Sin email expuesto, formulario con anti-spam.",
    chip: "Contacto",
    title1: "Mandanos un ",
    titleHighlight: "mensaje",
    titleSuffix: ".",
    intro:
      "Usamos un formulario en lugar de exponer un email. Lo recibe Marcos (mantenedor de Clara) y te respondemos al correo que dejes acá. Si entrás logueado, autocompletamos nombre y email; podés cambiarlos si querés.",
    privacyHint:
      "Sólo guardamos lo que escribas y, por seguridad, tu IP y user-agent durante 90 días para frenar spam.",
    kindLabel: "¿Sobre qué nos escribís?",
    kindOptions: [
      {
        value: "PRIVACY",
        label: "Privacidad / GDPR",
        description:
          "Acceso, rectificación, supresión, portabilidad, oposición o cualquier otro derecho.",
      },
      {
        value: "ABUSE",
        label: "Abuso o seguridad",
        description: "Cuenta sospechosa, brecha de seguridad, suplantación, phishing.",
      },
      {
        value: "BUG",
        label: "Bug o pedido",
        description: "Algo no anda, falta una feature o querés sugerir algo.",
      },
      {
        value: "GENERAL",
        label: "Otra cosa",
        description: "Cualquier otro tema.",
      },
    ],
    nameLabel: "Tu nombre",
    emailLabel: "Tu email",
    bodyLabel: "Tu mensaje",
    bodyPlaceholder: "Contanos qué necesitás. Cuanto más detalle, más rápido respondemos.",
    submit: "Enviar mensaje",
    submitting: "Enviando…",
    successTitle: "Mensaje recibido",
    successBody:
      "Lo recibimos. Si dejaste un email correcto, te respondemos a la brevedad — máximo 30 días para los temas de privacidad.",
    errorGeneric: "No pudimos enviar el mensaje. Probá de nuevo en un rato.",
  },
};

const EN: LocalisedMarketingContent = {
  HERO_PITCH:
    "Talk to her in plain language, send her a bank PDF, dictate a voice note from the web chat or Telegram. Clara understands, categorizes and keeps your balance up to date. Less drama, more done.",
  ELEVATOR_PITCH:
    "Chat-first expense tracker with personality. Open source, MIT, self-hostable. No telemetry, no per-user pricing, neutral English (or rioplatense Spanish — your call).",
  FEATURES: [
    {
      emoji: "📊",
      title: "Month expenses as a table",
      description:
        "On desktop, the month opens as a bank-grouped spreadsheet: recurring/one-off filters, charts, double-click edit, and what-if simulation without changing your real data.",
    },
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
        "Clara is an AI financial assistant: a conversational expense tracker that understands bank screenshots, PDFs, CSVs and voice notes from the web chat or Telegram. She helps you plan monthly expenses, and on desktop you can also view the month as a bank-grouped spreadsheet.",
    },
    {
      question: "How much does it cost?",
      answer:
        "Clara is open source under the MIT license and free to self-host. The version we host includes 30 free daily queries with the assistant. If that's tight and you want to help cover infrastructure, you can upgrade to the Supporter plan for €7.99/month (200 daily queries) or send a one-time donation in the amount of your choice from the chat. Donations and subscription are optional: the product is still free for most people.",
    },
    {
      question: "Does Clara have a spreadsheet / Excel-style view?",
      answer:
        "Yes, on desktop screens. On the month page (/m/YYYY-MM) the default is Expenses table: a bank-grouped spreadsheet with filters, charts, and a Simulate mode to try scenarios without saving. On phones you keep the chronological list. Clara’s answers about numbers are informational and can be wrong; they are not financial advice.",
    },
    {
      question: "How does Clara process PDFs and bank statements?",
      answer:
        "Clara uses multimodal language models via Vercel AI Gateway to extract transactions from PDFs, screenshots and CSVs. Processing runs on Vercel Functions: the file is uploaded to Vercel Blob temporarily, the model extracts the data, and Clara shows you a proposal before saving anything to your database.",
    },
    {
      question: "Which banks are supported?",
      answer:
        "Any bank in the world: import PDFs/CSVs or register expenses manually via chat or voice note. In Europe, if enabled on your account, you can also connect the bank via Open Banking (read-only, through Enable Banking). Clara never initiates payments or moves money.",
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
        "Mint, YNAB, Fintonic and similar are spreadsheets with better design: rows, categories and reports. Clara is chat-first: you talk to her in plain language, send her a PDF and she understands, send a voice note and she registers the expense. When you want the month as a spreadsheet, you also get that on desktop. AI is the core of the product, not a marketing feature. And it is open source.",
    },
  ],
  CHANGELOG: [
    {
      version: "0.19.0",
      date: "2026-08-28",
      title: "Clover and Warren ask you",
      highlights: [
        "Ask Clover or Warren about spending, cashflow, or savings — they now run a full Clara turn, not just a savings snapshot.",
        "Counts against trefolio AI consults, not your Clara daily cap.",
        "If you do not have a Clara account yet, they offer to create one with the same login.",
      ],
    },
    {
      version: "0.18.1",
      date: "2026-08-26",
      title: "Warren sees this month's cash",
      highlights: [
        "Investment questions always go to Warren — Clara does not answer them from local STOCK/CRYPTO.",
        "Warren crosses your trefolio portfolio with this month's cashflow (spend, surplus, day of month) and talks capacity, not what to buy.",
        "He always states he is not a licensed advisor and this is not investment advice.",
      ],
    },
    {
      version: "0.18.0",
      date: "2026-08-26",
      title: "Clara asks Warren",
      highlights: [
        "Ask Clara about your investments or to talk to Warren — she queries your trefolio portfolio and summarises it.",
        "If you do not have a trefolio account yet, she gives you the signup link: https://trefolio.com/signup",
        "Counts against your Clara daily quota, not Warren’s monthly consults on trefolio.",
      ],
    },
    {
      version: "0.17.0",
      date: "2026-08-25",
      title: "Sesiones de chat con memoria",
      highlights: [
        "Cada vez que abrís el chat arrancás con pantalla vacía; la charla igual queda guardada por sesión.",
        "Al salir (cerrar pestaña, irte de la app o 30 min sin escribir), Clara resume la sesión y usa ese resumen la próxima vez.",
        "Podés ver conversaciones guardadas desde el botón en la pantalla de bienvenida.",
      ],
    },
    {
      version: "0.16.1",
      date: "2026-08-25",
      title: "On-demand recurring widget",
      highlights: [
        "Ask to mark expenses as recurring or review recurring setup without uploading a PDF — Clara opens the checklist from the month's one-off lines.",
        "No manual candidate list from the agent and no import required.",
      ],
    },
    {
      version: "0.16.0",
      date: "2026-08-25",
      title: "Recurring expense widget",
      highlights: [
        "After a statement (or when you say these are recurring), Clara shows a checklist to pick which expenses become templates.",
        "Confirm once and the templates are created immediately — no one-by-one follow-ups.",
      ],
    },
    {
      version: "0.15.3",
      date: "2026-08-25",
      title: "Short chat bubbles stay readable",
      highlights: [
        "Short replies like \"Yes\" no longer collapse into a thin vertical pill in chat.",
      ],
    },
    {
      version: "0.15.2",
      date: "2026-08-25",
      title: "Full-batch imports and chat scroll",
      highlights: [
        "When a statement is clear, Clara loads every movement in one go (no 'shall I continue with the next batch?'); she only pauses on real doubts.",
        "Opening chat lands on the latest message at the bottom instead of stuck at the top.",
      ],
    },
    {
      version: "0.15.1",
      date: "2026-08-24",
      title: "PDF import on production",
      highlights: [
        "Fixed the internal error when uploading bank PDF statements in chat (the PDF reader worker was missing from the Vercel deploy).",
        "Re-send the PDF: Clara reads it, lists the movements, and skips duplicates on confirm.",
      ],
    },
    {
      version: "0.15.0",
      date: "2026-08-23",
      title: "Open Banking with Enable Banking",
      highlights: [
        "Connect a European bank from Settings: Clara pulls accounts, balances and movements automatically.",
        "A shortcut in chat, the menu, Banks and the month view lets you connect the account so Clara imports on her own.",
        "Consent lasts up to 180 days depending on the bank; when it expires we ask you to reconnect.",
        "Sandbox and restricted production (your own accounts only) so you can test without a contract.",
      ],
    },
    {
      version: "0.14.4",
      date: "2026-08-11",
      title: "Change bank when editing a template",
      highlights: [
        "When editing an expense template you can change the bank, not only the name and amount.",
      ],
    },
    {
      version: "0.14.3",
      date: "2026-08-11",
      title: "CSV import no longer blocked by trip wallets",
      highlights: [
        "Date rule: expenses inside the trip dates go on the wallet; outside stay standalone (unless you explicitly ask otherwise).",
        "If Clara reuses a trip eventId whose dates don't match, the expense is still saved as a standalone line instead of rejecting the whole batch.",
        "When you say \"skip the wallet\" / \"ignore the trip\", Clara stops auto-tagging that import.",
      ],
    },
    {
      version: "0.14.2",
      date: "2026-07-25",
      title: "Table view on the home page and SEO",
      highlights: [
        "The public landing highlights Expenses table for people who have not signed in yet.",
        "Meta, FAQ, Features and llms.txt mention the desktop month spreadsheet for better discovery in search and AI crawlers.",
      ],
    },
    {
      version: "0.14.1",
      date: "2026-07-24",
      title: "Tidier month page: submenu and table by default",
      highlights: [
        "On /m/YYYY-MM the spreadsheet, overview, list, and income each live in their own tab (no more stacking).",
        "On desktop, Expenses table is the default view; everything else is one click away in the submenu.",
      ],
    },
    {
      version: "0.14.0",
      date: "2026-07-24",
      title: "Desktop month table view",
      highlights: [
        "On wide screens you can view the month’s expenses as a bank-grouped spreadsheet with recurring/one-off filters and charts.",
        "Double-click to edit a value; click to ask Clara about that number in a floating chat.",
        "Simulate mode: try “what if I drop or cut an expense” without changing real data.",
      ],
    },
    {
      version: "0.13.0",
      date: "2026-05-31",
      title: "Cross-month CRUD and estimated dates",
      highlights: [
        "Create, edit, and delete expenses and income in past, current, or future months from the dashboard, chat, and Telegram; lines bucket by the real transaction date.",
        "When you omit a date in chat, Clara uses today and marks it as estimated; CSV/PDF imports keep the date from the statement.",
        "The agent acts with fewer confirmations on clear one-offs while still confirming bulk imports and deletions.",
      ],
    },
    {
      version: "0.12.10",
      date: "2026-05-22",
      title: "Telegram: CSV and PDF documents",
      highlights: [
        "You can send a bank CSV export as a Telegram document; Clara parses it the same way as in the web chat.",
        "Tighter PDF/CSV detection (including octet-stream with a .pdf/.csv extension) so real bank files no longer hit “unsupported file type”.",
      ],
    },
    {
      version: "0.12.9",
      date: "2026-05-09",
      title: "Profile & access on user.trefolio.com",
      highlights: [
        "With the unified IdP account, Settings → Profile & access links to the /account hub on user.trefolio.com (display name, password, Google, passkeys); Preferences and integrations stay in Clara.",
        "Display name and profile picture sync from the IdP together with the daily quota.",
      ],
    },
    {
      version: "0.12.8",
      date: "2026-05-09",
      title: "IdP login picks up trefolio’s language cookie",
      highlights: [
        "When you arrive from trefolio with the shared `trefolio_ui_locale` cookie (e.g. German or French), Clara forwards it to user.trefolio.com before falling back to Clara’s ES/EN toggle.",
      ],
    },
    {
      version: "0.12.7",
      date: "2026-05-09",
      title: "Subscription management only on user.trefolio.com",
      highlights: [
        "Settings → Subscription now only links upgrade and billing management to the IdP; the local Stripe Supporter checkout is gone.",
        "One-off donations still use Stripe in Clara; the Stripe webhook only records donations.",
        "Daily quota syncs from the IdP in the background (~60s throttle) so a Stripe cancellation shows up without signing in again.",
      ],
    },
    {
      version: "0.12.6",
      date: "2026-05-09",
      title: "Replies match your message language",
      highlights: [
        "Clara infers the primary language from your latest message (including attachments or transcribed voice) and replies in that language; when unclear, she falls back to your saved preference (English or Spanish).",
      ],
    },
    {
      version: "0.12.5",
      date: "2026-05-08",
      title: "Unified login: link existing Clara accounts",
      highlights: [
        "If you already had a Clara user via Google or email/password and signed in through user.trefolio.com, NextAuth failed with a misleading “Google account not linked” error. We now allow linking the `trefolio-id` provider to the same user by verified email, matching Will’s IdP setup.",
      ],
    },
    {
      version: "0.12.4",
      date: "2026-05-08",
      title: "Unified login: IdP UI matches Clara’s language",
      highlights: [
        "If Clara was in Spanish but your browser preferred another language, the IdP sign-in page sometimes opened in French or another locale. We now send Clara’s UI language via the OIDC `ui_locales` parameter so user.trefolio.com matches the language you were using in Clara.",
      ],
    },
    {
      version: "0.12.3",
      date: "2026-05-08",
      title: "Settings: Pro and billing on user.trefolio.com",
      highlights: [
        "With the unified IdP account, the Settings subscription card now offers “Upgrade to Trefolio Pro” and “Manage billing” links to user.trefolio.com (upgrade + Stripe portal) instead of disappearing when the legacy Supporter upsell is off.",
        "The daily-cap modal button label now explicitly reads “View plans on user.trefolio.com”.",
      ],
    },
    {
      version: "0.12.2",
      date: "2026-05-06",
      title: "Unified trefolio account: Telegram and the daily cap",
      highlights: [
        "When you sign in with user.trefolio.com, we persist your IdP subject and register Telegram with the IdP too so the same identity maps across apps.",
        "At the daily message cap, the web modal and Telegram now point to Trefolio Pro checkout on the IdP; the legacy Stripe Supporter upsell stays off while unified IdP billing is configured.",
      ],
    },
    {
      version: "0.12.1",
      date: "2026-05-04",
      title: "Sharing a trip works end-to-end again",
      highlights: [
        "When a friend opened your shared-trip link and tapped \"Join via Telegram\", they used to hit a generic \"We couldn't process your request\" error. The auth proxy was intercepting the public accept endpoint and bouncing it to the login page. The path is now exempt and the invite lands where it should: a fresh conversation with Clara on Telegram.",
        "You can also ask Clara to mint a share-link without opening the web — say \"share Málaga with Cyn\" or \"send me a link to the birthday\" and she'll generate a fresh URL and paste it back in chat for you to forward. Same 30-day expiry as the web link.",
      ],
    },
    {
      version: "0.12.0",
      date: "2026-05-04",
      title: "Clara now tells you what she's doing on Telegram",
      highlights: [
        "While Clara thinks, you now see a small status line that updates with each step — \"Logging the expense…\", \"Looking up your banks…\", \"Preparing chart…\". Forward motion instead of three silent dots.",
        "The status disappears the moment the final reply arrives, so the chat stays tidy.",
        "Same idea you already had in the web chat: every action is now visible on Telegram too.",
      ],
    },
    {
      version: "0.11.3",
      date: "2026-05-03",
      title: "Every expense keeps its day — even from a screenshot",
      highlights: [
        "Before, when you dropped a bank screenshot, Clara could log transactions with today's date even if they happened a week ago. She now reads the actual date of each line (day, month and year) off the source and saves it correctly.",
        "If the date in the screenshot is missing, cropped or ambiguous (\"Apr\", \"yesterday\", no year), she asks you before logging instead of guessing the day.",
        "Same for receipts, PDFs and CSVs: the date that appears in the document is the one that lands in your month, not the moment you uploaded it.",
      ],
    },
    {
      version: "0.11.2",
      date: "2026-05-03",
      title: "If Clara picks the wrong event id, your expense still lands",
      highlights: [
        "After the previous fix the model kept slipping a bank id into the event id slot (a real CUID, just from the wrong namespace), and the call failed again with \"event doesn't exist\".",
        "Now if the `eventId` doesn't resolve to a real trip of yours, the line is created as a standalone expense anyway and the agent gets a note explaining the mistake so it does not repeat it on the next turn.",
        "Same for `paidByUserId`: if the value the model sends is not an actual participant of the trip, we fall back to you as the payer instead of blocking the line.",
      ],
    },
    {
      version: "0.11.1",
      date: "2026-05-03",
      title: "Telegram expense logging no longer fails on phantom events",
      highlights: [
        "When you sent a bank screenshot via Telegram and confirmed \"yes, log it\", Clara would sometimes attach each expense to an invented event (a slash, a comma, the name of the last trip) and the whole batch failed with \"event doesn't exist\".",
        "The agent can now only pass real CUID ids for `eventId` / `paidByUserId` — the ones the tool itself returns — and the prompt explicitly tells it to omit the field when no active trip matches instead of guessing.",
      ],
    },
    {
      version: "0.11.0",
      date: "2026-05-02",
      title: "Share a trip and split the bill at close",
      highlights: [
        "Event wallets are now shareable: from the trip detail you mint a link and send it to whoever's coming. You can revoke any link at any time and, for safety, the plaintext link is only shown once at mint time.",
        "Anyone opening the link joins in one of two ways: with their existing Clara account (one click and the trip appears in their dashboard) or as a Telegram-only guest with no account at all. In the second case we send them straight to the bot and onboard them inside the chat.",
        "Every shared expense remembers who paid. When the trip has more than one participant Clara asks \"did you pay or did Marina cover it?\" before logging, so nothing ends up orphaned at split time.",
        "Live settlement preview on the trip screen: total, fair share per head, what you paid, your balance (owed to you / owed by you) and the suggested transfers. Updates with every expense logged.",
        "When the trip closes, every participant gets a Telegram summary spelling out: per-head share, what you paid, who you transfer to and how much (or who transfers to you). The organiser absorbs the rounding cent so debtor amounts stay clean two-decimal numbers.",
        "If a guest later wants a full Clara account, there's a one-page upgrade at `/upgrade-guest` that takes email + password and keeps everything you already logged on the trip.",
      ],
    },
    {
      version: "0.10.0",
      date: "2026-05-02",
      title: "Delete account with a 30-day undo window",
      highlights: [
        "When you delete your account from Settings, it now goes into a 30-day queue: nothing is lost in the meantime and, if you change your mind, you sign back in and tap \"Restore my account\".",
        "While queued: chat, APIs and the Telegram daily nudge are paused, and your MCP PAT stops working so no AI client keeps touching data you asked to remove.",
        "If you have an active Supporter subscription, we cancel it the moment you press delete — we don't wait for the 30 days, so you're not charged another month you won't use.",
        "We email you at T-7 days and again the day before the purge so the grace window doesn't slip past you. If you've changed your mind, the email button takes you straight to the recovery screen.",
        "Want it gone immediately? There's an explicit \"Skip the grace window\" checkbox: tick it and we wipe everything at once instead of waiting 30 days.",
        "After 30 days, a daily sweep wipes everything in cascade: banks, templates, expenses, messages, savings, MCP tokens and passkeys. Privacy and Terms move to version 1.1 with this change.",
      ],
    },
    {
      version: "0.9.0",
      date: "2026-05-02",
      title: "Daily Telegram reminders",
      highlights: [
        "If you haven't logged anything during the day, Clara sends you a Telegram message at 20:00 in your timezone asking whether you have any income or expense to record.",
        "Only enabled for users who linked Telegram; a switch in Settings → Integrations → Telegram turns it off any time.",
        "The messages are AI-written but do not consume your daily agent quota: they are system-initiated turns, not requests you made.",
        "Timezone is inferred from the country you picked during onboarding; unknown countries default to 20:00 UTC.",
      ],
    },
    {
      version: "0.8.1",
      date: "2026-05-02",
      title: "Telegram is replying again",
      highlights: [
        "Fixed a bug that left Clara silent on Telegram: the webhook was returning 500 on every inbound message (text, photo or voice) because a PDF library loaded eagerly when it shouldn't. Resolved.",
      ],
    },
    {
      version: "0.8.0",
      date: "2026-05-02",
      title: "Event wallets — group every expense from a trip into one line",
      highlights: [
        "Create a wallet for your next trip (or wedding, birthday, one-off event) with a name and date range. While the wallet is open, expenses still live in their real month, but the dashboard groups them under a single collapsible row with the running total.",
        "Clara figures out you're on the road: when you log an expense whose date falls inside the event's range, she auto-tags it and tells you the running total. If the description doesn't fit (Spotify, rent), she asks before tagging.",
        "When you close the wallet, pick how to attribute the spend: 'everything to one month' (default — perfect for trips that span months) or 'keep each expense in its real month'. If you reopen later, expenses return to their original months without losing a thing.",
        "Full coverage: the AI agent and the per-user MCP expose the new tools (`createEvent`, `closeEvent`, `attachExpenseToEvent`, etc.), with explicit confirmation on every MCP write call.",
        "UI parity: everything chat can do is one click away. Each row in the month view has a menu to tag or detach from an event. The wallet page has an 'Add expenses' action to bulk-attach existing standalone expenses, and you can edit the name, dates and color without leaving the screen.",
      ],
    },
    {
      version: "0.7.4",
      date: "2026-05-01",
      title: "LinkedIn launch polish: hardened MCP, Telegram PDFs, technical i18n",
      highlights: [
        "Per-user MCP: Upstash rate limits + destructive tools require explicit `confirm: true`, matching the web chat rules.",
        "Public MCP: `?lang=es|en` / `Accept-Language` negotiation and `serverInfo.version` synced from the public changelog.",
        "Telegram: PDF documents (extracted text + rasterised pages), locale-specific slash commands (en/es).",
        "API tokens ship with the `clara_pat_` prefix (`ada_pat_` still accepted). README gains a Mermaid architecture diagram and `public/screenshots/` assets.",
        "CI spins up Postgres so `prisma migrate diff` fails the build on migration drift.",
        "Neutral-English API errors, English-first Zod tool descriptions, and a Vitest guard against Spanish diacritics leaking into the API/AI layer.",
      ],
    },
    {
      version: "0.7.3",
      date: "2026-05-01",
      title: "Clara cleans up duplicate savings movements",
      highlights: [
        "Tell Clara 'delete the duplicates from my savings' and she first shows you the groups she found (same kind, amount, currency, date and note) so you can confirm before anything is removed.",
        "When you confirm, she deletes every extra in each group inside a single transaction, keeps the oldest one and rebalances the pile — no risk of drift.",
        "Only manual movements (`MANUAL_DEPOSIT`/`MANUAL_WITHDRAWAL`) are touched. System entries (monthly contribution, debt coverage, leftover deposits) already have per-month uniqueness and are skipped.",
      ],
    },
    {
      version: "0.7.2",
      date: "2026-05-01",
      title: "Telegram greets you with a step-by-step guide",
      highlights: [
        "The first time you link Telegram, Clara generates the welcome with AI: she greets you, asks whether to start with an income or an expense, and offers 3-4 example prompts you can tap or rewrite.",
        "Until the account is set up (no confirmed currency or no movements yet this month), every turn nudges you to the next step using the same tools you already know (addIncomeLine, addMonthLine, setPrimaryCurrency).",
        "If your account was already set up via the web, the static welcome and inline menu stay the same — the guide only appears when it's actually useful.",
      ],
    },
    {
      version: "0.7.1",
      date: "2026-05-01",
      title: "Clara can now delete and subtract savings from chat",
      highlights: [
        "Say 'delete that savings movement' or 'remove the deposit I logged by mistake' and Clara wipes it from the ledger (manual movements only — system ones still need you to redo the carryover decision).",
        "'Subtract 50 from the pile' or 'I took 200 out of savings' now triggers a manual withdrawal without leaving the chat.",
        "Same power via MCP: any AI client of yours can list, top up, withdraw from and delete manual entries on the pile with your permission.",
      ],
    },
    {
      version: "0.7.0",
      date: "2026-05-01",
      title: "GDPR compliance: consent, export, deletion and contact",
      highlights: [
        "Privacy policy and Terms rewritten in full (GDPR Art. 13): legal basis per field, sub-processors with country, international transfers under SCCs, numeric retention windows and your rights spelled out one by one.",
        "Demonstrable consent: we now record `acceptedTermsAt` and the exact version you accepted. When terms change materially you are asked to accept again before continuing, no quiet edits.",
        "Settings → Your information: download a JSON dump of everything we hold on you (Art. 15) and delete your account on demand (Art. 17), with re-authentication and automatic Stripe cancellation.",
        "Public contact channel: new /contact form with Cloudflare captcha — no personal email of the controller is published anywhere.",
        "An /admin/contact inbox lets the team triage privacy, abuse, bug and support requests with read / replied / archived states.",
      ],
    },
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
      heading: "1. Who Clara is and who is responsible for your data",
      body: [
        "Clara is an AI financial assistant, open source under the MIT license and self-hostable. This policy applies to the version hosted at clara.trefolio.com.",
        "The data controller is Marcos Suarez, maintainer of Clara as a personal open-source project. If you self-host Clara on your own infrastructure, you (or your organization) are the controller, not us.",
        "To exercise any privacy right or ask a question, use the public form at /contact and pick the reason \"Privacy / GDPR\". We do not publish a personal email — the form lands in the controller's inbox and we reply from the address you provide there.",
      ],
    },
    {
      heading: "2. What we collect",
      body: [
        "Account and authentication: email, hashed password (bcrypt), optional name and avatar synced from Google if you sign in with Google, email-verified flag, passkeys (WebAuthn) you register, preferred language, country declared during onboarding.",
        "Account kind (`User.kind`): REGULAR by default. If you joined Clara by accepting a shared-trip invite without creating an account, your account is a GUEST: it only holds your display name, the linked Telegram chat, and access to that one trip. It has no password, no required email, and no access to the dashboard or to your own months; you can convert it to REGULAR at any time at /upgrade-guest.",
        "Financial data: banks you register, expense and income templates, monthly lines (amount, description, category, date, currency, frozen FX rate) and, for expenses logged inside a shared event wallet, which participant paid that line (`paidByUserId`); the global savings pile and its movement ledger, agent instructions.",
        "Open Banking (opt-in): if you connect a European bank via Enable Banking we store an encrypted session id, bank name, country, consent expiry, linked accounts (masked IBAN) and a record of imported movements. Admin API logs never store IBANs or descriptions.",
        "Shared event wallets: if you invite someone to a trip via a share-link, we store per participant their event-scoped display name, their role (organiser or guest) and, for fresh Telegram-only invitees, a single-use code to bind the bot. Share-links are stored as a sha256 hash — never the plaintext link — and you can revoke them from the trip screen at any time; revocation, expiration and last-use timestamps are visible to you.",
        "Conversations: web chat messages (text + structured attachments as JSON), Telegram messages if you link the bot, agent usage counters and per-day model usage.",
        "Warren consult (per-message opt-in): if you ask Clara about your investments or to talk to Warren, Clara sends your unified-account identifier (IdP `sub` and email), the question, and an aggregated snapshot of the current month (income, planned/paid expenses, balance, savings pile, day of month) — not each expense line — to trefolio (same organisation) so Warren can cross cashflow with the portfolio. If you self-host, this is off unless you set `TREFOLIO_BASE_URL`.",
        "Telegram reminder preference and the timestamp of the last reminder we sent (only applies if you linked Telegram; used to avoid more than one outbound message per day and so you can turn reminders off whenever you want from Settings).",
        "Payments (only if you subscribe or donate): a Stripe customer id, subscription status and current period end, a record of each donation (Stripe id, amount, date).",
        "AI access tokens (MCP): name, 12-character prefix, creation date, last use, expiration and revocation. The full token is hashed with SHA-256 before storage; the plaintext is shown only once.",
        "Minimal technical metadata: truncated IP and user-agent in error and rate-limit logs (no profiling), last-seen date, daily activity row for DAU/WAU.",
        "If you self-host, the data lives in whatever database you configure.",
      ],
    },
    {
      heading: "3. What we use it for and the legal basis (Art. 6 GDPR)",
      body: [
        "Performance of the contract (Art. 6(1)(b)): operating your account, persisting your expenses, incomes and messages, processing PDFs/audio/screenshots you send us, running the agent with your tools, consulting Warren on trefolio when you ask, charging the Supporter subscription or donations you choose to make.",
        "Legal obligation (Art. 6(1)(c)): keeping payment and donation records for the period required by applicable tax law, verifying your email before enabling password sign-in.",
        "Legitimate interest (Art. 6(1)(f)): protecting Clara and its users from abuse (Cloudflare Turnstile, IP rate-limits), monitoring errors (Sentry if configured), auditing administrative access.",
        "Consent (Art. 6(1)(a)): explicit acceptance of these Terms and this Policy at signup (stored in `User.acceptedTermsAt` with the version). Linking Telegram is itself a voluntary action that activates the two-way channel with the bot — including the daily proactive reminders Clara sends at 20:00 local time when you haven't logged anything that day. You can turn these reminders off any time from Settings → Integrations → Telegram without breaking the link. Connecting a bank via Open Banking is a separate explicit PSD2 consent: Clara only reads accounts, balances and movements; she never initiates payments. You can disconnect any time from Settings.",
        "We never sell data. We do not run behavioural analytics. We do not use your financial data to train models.",
      ],
    },
    {
      heading: "4. Sub-processors",
      body: [
        "Vercel Inc. (US) — application hosting, managed Postgres database (via Marketplace), Vercel Blob for TTS audio, Vercel Runtime Cache, AI Gateway routing model calls. Receives all persisted data as infrastructure.",
        "OpenAI (US) — Whisper for voice transcription, OpenAI TTS for audio replies, GPT-* through AI Gateway. Under zero data retention.",
        "Anthropic (US) and Google (US) — additional model providers routed by AI Gateway when applicable, also under ZDR.",
        "Cloudflare Inc. (US) — Turnstile (captcha) on signup and login. Receives IP and browser metadata to evaluate the challenge; never receives email, password or financial data.",
        "Resend Inc. (US) — transactional emails (email verification, alerts). Receives only your email and the message content, no balance data.",
        "Stripe Inc. / Stripe Payments Europe Ltd (US/IE) — payment processing if you subscribe or donate. Receives email, country, card details. Clara never sees the card number.",
        "Upstash Inc. (US) — Redis for rate-limits. Receives IP and counters; no message content.",
        "Telegram FZ-LLC (AE) — Bot API, only if you link Telegram. Receives the messages you send to the bot.",
        "Enable Banking Oy (FI) — Open Banking / PSD2, only if you connect a bank from Settings. Receives the bank authorisation flow and, with your consent, accounts, balances and movements. Clara never initiates payments.",
        "Google LLC (US) — OAuth 2.0, only if you sign in with Google. Standard authentication flow.",
        "Sentry GmbH (DE) — error aggregation, only if the operator configured `SENTRY_DSN`. Receives stack traces and technical context, no message payloads.",
        "When you self-host, you choose which sub-processors to use (all are optional and degrade gracefully).",
      ],
    },
    {
      heading: "5. International transfers",
      body: [
        "Several sub-processors are based in the United States or in jurisdictions outside the EEA. Where applicable, transfers are covered by Standard Contractual Clauses (SCCs, EU 2021/914 decision) and, where the processor is certified, by the EU-US Data Privacy Framework. Telegram FZ-LLC operates from the United Arab Emirates; data is sent to it only if you link the bot.",
      ],
    },
    {
      heading: "6. Retention periods",
      body: [
        "Account and financial data: until you delete the account. When you ask for deletion the account is queued for 30 days during which you can recover it with one click; after 30 days the deletion is permanent and cascades.",
        "TTS audio on Vercel Blob: up to 7 days.",
        "Application logs (Vercel/Sentry): 30 days.",
        "Stripe webhook idempotency: 18 months.",
        "Donation and subscription receipts: 7 years (EU tax obligation).",
        "MCP tokens: until you revoke them; revoked tokens are purged after 30 days.",
        "Shared-event share-link tokens: until expiration or revocation; revoked or expired ones are purged after 30 days. Guest accounts (User.kind = GUEST) created from one of those links follow the general rules: they live until you delete them, or are purged in cascade when the trip's organiser deletes the event or their own account.",
        "Chat messages (web and Telegram): until you delete the account or ask the agent to purge them.",
        "Contact form messages: 24 months; technical metadata (IP / user-agent of the submission) max 90 days or until the message is archived, whichever comes first.",
        "Open Banking: the connection, linked accounts and imported movements live with the account (or until you disconnect the bank). Admin API logs are purged after 30 days.",
      ],
    },
    {
      heading: "7. Your rights",
      body: [
        "Access (Art. 15): download all your data in JSON from Settings → Your data and account.",
        "Portability (Art. 20): the JSON above is structured and machine-readable.",
        "Erasure / right to be forgotten (Art. 17): delete your account from Settings. It's queued for 30 days during which you can reverse it by signing in and tapping \"Restore my account\"; after that window the deletion is permanent and cascades. Donations remain on Stripe for tax obligations.",
        "Rectification (Art. 16), restriction (Art. 18), objection (Art. 21) and withdrawal of consent (Art. 7(3)): send us a message via /contact picking \"Privacy / GDPR\". We respond within 30 days.",
      ],
    },
    {
      heading: "8. Right to lodge a complaint",
      body: [
        "You have the right to complain to the supervisory authority of your country of residence: AEPD in Spain, CNIL in France, Garante per la Privacy in Italy, BfDI in Germany, etc. The list of European authorities lives at https://edpb.europa.eu/.",
      ],
    },
    {
      heading: "9. Visibility inside a shared trip",
      body: [
        "When you accept a share-link to a trip, the other participants (including the organiser) see your display name and, for every expense you log inside the trip, the line's data (date, description, amount in the organiser's currency and category). They don't see anything else from your account: not your other expenses, not your balance, not your real identity beyond the name you picked when joining.",
        "If you were invited via Telegram only (GUEST account), your Telegram identity (user id) is bound to that account so the bot knows it's you. That identity is NOT shown to the other participants — they only see your display name.",
        "The organiser can remove you from the trip at any time. The lines you already logged stay in the trip (if you want to delete them, do so before being removed); from removal onwards you cannot log more.",
        "If you delete your GUEST account, the expenses you logged for the trip stay in the organiser's books (you logged them inside their book as part of the shared trip); your name stops appearing and the settlement is recomputed without you.",
      ],
    },
    {
      heading: "10. Strictly necessary cookies",
      body: [
        "We only use two cookies, both necessary for Clara to work and exempt from prior consent under the ePrivacy directive:",
        "`next-auth.session-token` (signed JWT, 30 days, HttpOnly Secure SameSite=Lax) — keeps you signed in.",
        "`NEXT_LOCALE` (1 year, SameSite=Lax) — remembers your preferred language so the server-render starts in the right language without flicker.",
        "We don't load analytics, ad pixels or fingerprinting.",
      ],
    },
    {
      heading: "11. Minimum age",
      body: [
        "Clara is intended for people aged 16 or older. In the European Union Art. 8 GDPR sets that threshold by default; in jurisdictions where the applicable threshold is lower, verifiable parental consent is required. If we discover an account from a minor without that consent, we delete it.",
      ],
    },
    {
      heading: "12. Data breach notifications",
      body: [
        "If a breach affects your personal data with reasonable risk, we notify you by email as soon as possible and always within the 72 hours required by Art. 33-34 GDPR, and report to the supervisory authority where applicable.",
      ],
    },
    {
      heading: "13. Changes to this policy",
      body: [
        "When we change this policy in a material way, we bump `CURRENT_PRIVACY_VERSION` and ask you to accept the new version on your next visit. Minor changes (typos, broken links) do not force re-acceptance.",
      ],
    },
    {
      heading: "14. Contact",
      body: [
        "For any question or right exercise: use the form at /contact, reason \"Privacy / GDPR\". The controller is a natural person; there is no formal DPO.",
      ],
    },
  ],
  TERMS_SECTIONS: [
    {
      heading: "1. Who provides Clara",
      body: [
        "Clara is an AI financial assistant maintained by Marcos Suarez as a personal project, distributed under the MIT license and self-hostable. These Terms govern the use of the version hosted at clara.trefolio.com. If you self-host Clara, the conditions apply between you and the users you host; we are not a party.",
        "These Terms form a legal agreement with you. If you do not agree, do not use Clara.",
      ],
    },
    {
      heading: "2. Account and eligibility",
      body: [
        "You must be 16 or older (or the minimum in your jurisdiction if higher). You are responsible for the information you upload and for keeping your credentials safe.",
        "One account = one person. Duplicate accounts to evade quotas are grounds for suspension.",
        "You can delete your account at any time from Settings → Your data and account.",
      ],
    },
    {
      heading: "3. Acceptable use",
      body: [
        "Do not use Clara for illegal activities, fraud, money laundering, tax evasion or impersonation.",
        "Do not automate the app beyond the tools we offer (per-user MCP with your PAT, documented API). In particular, scraping the Telegram bot, reverse engineering internal endpoints and bypassing rate-limits are forbidden.",
        "Do not use Clara to store sensitive third-party data without their consent (someone else's health data, etc.).",
        "If you share a trip via a share-link, you are responsible for inviting only people who agreed to participate and for telling them, before they accept, the public terms of the trip (what it's about and why you need their name and, optionally, their Telegram).",
      ],
    },
    {
      heading: "4. Supporter subscription and donations",
      body: [
        "Clara is free for personal use with a daily agent message cap. The Supporter subscription (€2.99 / €7.99 depending on tier) lifts that cap and identifies you as a sponsor. Donations are optional one-off contributions.",
        "Payments are processed by Stripe (Stripe Inc. / Stripe Payments Europe Ltd). Monthly auto-renewal unless you cancel from Settings → Subscription.",
        "Donations are non-refundable. Charged subscriptions are refunded at our discretion if the charge was a clear mistake on our side.",
        "If we change prices, we notify you at least 30 days in advance; you can cancel before the new price applies.",
      ],
    },
    {
      heading: "5. Your content",
      body: [
        "Your statements, messages, bank photos and financial data are yours. You retain all rights.",
        "You grant us a limited license to process that content only as needed to deliver the service (display it in the UI, send it to models via AI Gateway with ZDR, show it on other devices where you're signed in).",
        "If you connect a bank via Open Banking, you authorise Clara to read accounts, balances and movements and import them automatically. Clara never initiates payments. You can disconnect any time; already imported movements stay in your account.",
        "We never use your content to train models. We never sell it.",
      ],
    },
    {
      heading: "6. Warranty disclaimer and limitation of liability",
      body: [
        "Clara is NOT a financial advisor, regulated entity or accountant. The information shown is for personal organisation; investment, tax or credit decisions are yours and, if material, should be discussed with a professional.",
        "The service is provided \"AS-IS\" and \"AS AVAILABLE\". We do not warrant uninterrupted availability, absence of errors, or that the AI is always correct — the agent confirms before mutating your database precisely for that reason. Open Banking is the exception: connecting a bank authorises auto-import on every sync.",
        "To the maximum extent permitted by applicable law: our aggregate liability for any claim is limited to the greater of (a) the amounts you paid us in the previous 12 months and (b) zero. We are not liable for indirect damages, lost profits, or data loss when self-hosting is under your control.",
      ],
    },
    {
      heading: "7. Indemnification",
      body: [
        "You indemnify us against third-party claims arising from your misuse of Clara, content of yours that infringes third-party rights, or breach of these Terms. The indemnity is limited to direct, reasonable damages and does not apply to breaches caused by us.",
      ],
    },
    {
      heading: "8. Suspension and termination",
      body: [
        "You can delete your account at any time (Settings → Your data and account).",
        "We can suspend or terminate accounts that violate these Terms, harm other users, abuse the service, or pose a legal risk to the project. Where possible we notify you in advance; where not (flagrant abuse, legal demand), afterwards.",
      ],
    },
    {
      heading: "9. Changes to the service and to these Terms",
      body: [
        "Clara evolves. We can change features, prices and these Terms. Material changes to the Terms trigger re-acceptance: on your next visit we'll ask you to confirm the new version before continuing. Minor changes (typos, links) do not.",
      ],
    },
    {
      heading: "10. Governing law and jurisdiction",
      body: [
        "These Terms are governed by Spanish law and, where applicable as an EU consumer, by the law of your country of residence. Disputes are resolved before the courts of the consumer's domicile when consumer rules require it; otherwise the courts of Madrid, Spain.",
      ],
    },
    {
      heading: "11. Contact",
      body: [
        "For bug reports, abuse complaints or any inquiry: public form at /contact. For open-source technical issues you can also open an issue at https://github.com/kyberis/etracker (be aware: anything you open there is public).",
      ],
    },
  ],
  CONTACT_COPY: {
    metaTitle: "Contact",
    metaDescription:
      "Get in touch about Clara: privacy and GDPR rights, abuse or security, bugs or any other inquiry. No exposed email, anti-spam form.",
    chip: "Contact",
    title1: "Send us a ",
    titleHighlight: "message",
    titleSuffix: ".",
    intro:
      "We use a form instead of exposing an email. Marcos (Clara's maintainer) receives it and we reply to the address you leave here. If you're signed in we prefill name and email; you can change them.",
    privacyHint:
      "We only store what you write and, for security, your IP and user-agent for 90 days to fight spam.",
    kindLabel: "What's this about?",
    kindOptions: [
      {
        value: "PRIVACY",
        label: "Privacy / GDPR",
        description:
          "Access, rectification, erasure, portability, objection or any other right.",
      },
      {
        value: "ABUSE",
        label: "Abuse or security",
        description: "Suspicious account, security breach, impersonation, phishing.",
      },
      {
        value: "BUG",
        label: "Bug or request",
        description: "Something is broken, a feature is missing, or you have an idea.",
      },
      {
        value: "GENERAL",
        label: "Something else",
        description: "Any other topic.",
      },
    ],
    nameLabel: "Your name",
    emailLabel: "Your email",
    bodyLabel: "Your message",
    bodyPlaceholder: "Tell us what you need. The more detail, the faster we can reply.",
    submit: "Send message",
    submitting: "Sending…",
    successTitle: "Message received",
    successBody:
      "Got it. If you left a valid email address, we'll reply soon — within 30 days at most for privacy matters.",
    errorGeneric: "We couldn't send the message. Try again in a bit.",
  },
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

/**
 * Current user-visible product version, derived from the most recent CHANGELOG
 * entry. Both ES and EN changelogs are kept in lockstep, so reading from `ES`
 * is fine. Used by MCP server discovery, OpenAPI, and anywhere we need to
 * report the public version (NOT `package.json`, which intentionally stays at
 * `0.1.0` per the changelog rule).
 */
export const PRODUCT_VERSION: string = ES.CHANGELOG[0]?.version ?? "0.0.0";
