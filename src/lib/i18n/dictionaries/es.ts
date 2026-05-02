/**
 * Spanish (rioplatense) dictionary. The shape inferred from this file is the
 * canonical `Dict` type — `en.ts` is typed `: Dict` so missing keys fail the
 * TypeScript build.
 *
 * Keep keys grouped by domain (header, settings, marketing, …) and prefer
 * functions over template literals when interpolation is needed: that keeps
 * pluralisation/locale-specific glue local to the dictionary.
 */

export const es = {
  common: {
    save: "Guardar",
    saving: "Guardando…",
    cancel: "Cancelar",
    confirm: "Confirmar",
    delete: "Borrar",
    edit: "Editar",
    close: "Cerrar",
    loading: "Cargando…",
    retry: "Reintentar",
    back: "Volver",
    open: "Abrir",
    add: "Agregar",
    update: "Actualizar",
    yes: "Sí",
    no: "No",
    optional: "(opcional)",
    required: "(obligatorio)",
    error: "Error",
    success: "Listo",
    on: "Activado",
    off: "Desactivado",
    actions: "Acciones",
    search: "Buscar",
    name: "Nombre",
    amount: "Monto",
    date: "Fecha",
    bank: "Banco",
    category: "Categoría",
    currency: "Moneda",
    notes: "Notas",
    description: "Descripción",
  },

  brand: {
    name: "Clara",
    tagline: "Tu asistente financiera con IA",
    avatarAlt: "Clara",
    homeLabel: "Inicio Clara",
    onlineRioplatense: "en línea · habla rioplatense",
    onlineEnglish: "en línea · habla inglés",
  },

  header: {
    nav: {
      banks: "Bancos",
      expenses: "Plantillas",
      incomes: "Ingresos",
      savings: "Ahorros",
      events: "Eventos",
      settings: "Configuración",
      about: "Sobre Clara",
      admin: "Administración",
      assistant: "Asistente",
    },
    monthButton: "Mes",
    monthPanelLabel: "Abrir panel del mes",
    balancePillLabel: "Abrir balance del mes",
    openMenu: "Abrir menú",
    monthPanelMobile: "Panel del mes",
    menuTitle: "Menú",
    signOut: "Cerrar sesión",
    languageLabel: "Idioma",
    balancePrefix: "balance",
    pendingShort: "pend.",
    incomeShort: "ingreso",
    placeholderDash: "—",
  },

  marketingNav: {
    primaryNavLabel: "Navegación principal",
    features: "Features",
    about: "Sobre Clara",
    faq: "FAQ",
    changelog: "Changelog",
    github: "GitHub",
    openClara: "Abrir Clara",
    signIn: "Iniciar sesión",
    signUp: "Crear cuenta",
    languageLabel: "Idioma",
    footerProductTitle: "Producto",
    footerProductLinks: {
      features: "Features",
      about: "Sobre Clara",
      faq: "FAQ",
      changelog: "Changelog",
      privacy: "Privacidad",
      terms: "Términos",
      contact: "Contacto",
    },
    footerForAisTitle: "Para AIs",
    footerForAisLinks: {
      llms: "/llms.txt",
      llmsFull: "/llms-full.txt",
      mcpPublic: "/api/mcp (público)",
      mcpDescriptor: "/.well-known/mcp.json",
      openapi: "/openapi.json",
    },
    footerCopy: (year: number) => `© ${year} Trefolio · Licencia MIT`,
    footerHomepage: "trefolio.com",
    footerTagline: "Tu asistente financiera con IA. Open source, MIT, self-hostable.",
  },

  landing: {
    chip: "Money coach con IA · Open Source · MIT",
    title1: "Tu plata,",
    title2: "finalmente",
    title2highlight: "Clara",
    cta: {
      register: "Empezar gratis",
      registerArrow: "→",
      seeFeatures: "Ver qué hace",
    },
    badges: {
      noCard: "Sin tarjeta",
      noTelemetry: "Sin telemetría",
      selfHostable: "Self-hosteable",
    },
    chatPreview: {
      conciseSticker: "conciso",
      bubbleUser1: "Pagué el alquiler hoy, $850",
      bubbleClaraText: (rentLabel: string, leftLabel: string) =>
        `Listo, marqué ${rentLabel} como pagado en abril ✅. Te quedan ${leftLabel} para los pendientes del mes.`,
      bubbleClaraLineLabel: "Alquiler · vivienda · Galicia",
      bubbleClaraRentLabel: "Alquiler",
      bubbleClaraLeftLabel: "USD 1.240",
      bubbleUser2: "Tirame un PDF del banco",
      mcpReadySticker: "+ MCP-ready",
      balanceLabel: "balance · abr '26",
    },
    stats: {
      income: "Ingreso",
      incomeSub: "USD · abril",
      planned: "Planificado",
      plannedSub: "7 plantillas",
      paid: "Pagado",
      paidSub: "+200 hoy",
      pending: "Pendiente",
      pendingSub: "2 ítems",
    },
    pitchTitle1: "Una",
    pitchTitleAssistant: "asistente",
    pitchTitle2: ", no una planilla.",
    pitchExtra:
      "Cada feature está pensada para que entiendas tu plata sin abrir Excel — y para que tu propio AI te ayude sin pedirte permiso quince veces.",
    mcpCallout: {
      sticker: "MCP-ready",
      titlePart1: "Tu propio AI puede",
      titleHighlight: "hablar con Clara",
      body: "Clara expone un servidor MCP (Model Context Protocol). Generás un token desde Configuración y lo pegás en Claude Desktop, Cursor o cualquier cliente compatible: tu asistente consulta tus meses, mira el balance y registra gastos con tu permiso.",
      howTo: "Cómo conectarlo",
      mcpPublic: "MCP público",
      configComment: "# Claude Desktop / Cursor mcp.json",
    },
    rule: {
      sticker: "menos drama",
      titlePart1: "La regla de Clara:",
      titleHighlight: "menos planilla, más decisiones",
      body: "Solo las plantillas recurrentes nacen pendientes. Lo que cargues en el mes — por chat, voz o foto — se marca como pagado por defecto. Vos te enfocás en decidir, Clara se ocupa del resto.",
    },
    finalCta: {
      titlePart1: "Tu plata",
      titleHighlight: "clara",
      titlePart2: ", en cinco minutos.",
      body: "Creás cuenta, vinculás (opcional) Telegram, y Clara se hace cargo del resto.",
      register: "Empezar gratis",
      faq: "Resolver dudas",
    },
    metaTitle: "Clara — tu asistente financiera con IA",
    metaDescription:
      "Tu money coach con IA. Chateá con tu plata: PDFs, notas de voz, Telegram. Open source MIT, self-hostable, con servidor MCP para integrar con Claude, ChatGPT y Cursor.",
  },

  marketingFeaturesPage: {
    metaTitle: "Features",
    metaDescription:
      "Todo lo que Clara puede hacer por tus finanzas: chat con IA, PDFs, notas de voz, Telegram, MCP y más.",
    chip: "Capacidades · Abr 2026",
    title1: "Lo que",
    titleHighlight: "Clara hace",
    title2: "(de verdad)",
    intro:
      "No vendemos cartelitos. Cada feature está implementada y la usás todos los días dentro de la app. Esto es lo que importa:",
    sectionsTitle: "Por feature",
    cta: "Empezar gratis",
    cta2: "Ver FAQ",
  },

  marketingAboutPage: {
    metaTitle: "Sobre Clara",
    metaDescription:
      "Clara nació para que la gestión de plata deje de sentirse como llevar una planilla. Open source, MIT, hecha desde Trefolio.",
    chip: "Sobre Clara",
    title1: "Un",
    titleHighlight: "money coach",
    title2: ", no una planilla.",
    metaSubtitle:
      "Clara es la asistente financiera con IA que querés tener al lado cuando llegan los gastos del mes — incluso si tu relación con tus finanzas está estresada.",
    sectionWhyTitle: "¿Por qué Clara?",
    sectionWhyBody1:
      "La mayoría de las apps de finanzas son planillas con interfaz mejorada: filas, categorías, reportes. Funcionan, pero te ponen a vos a hacer el laburo de un contador.",
    sectionWhyBody2:
      "Clara empieza por la conversación. Le decís lo que pasó (en castellano, por chat, voz o foto), y ella entiende, categoriza y mantiene tu balance al día. Las plantillas, los meses, los bancos — todo lo importante de un tracker — siguen ahí, pero ahora son herramientas, no la app.",
    sectionPersonalityTitle: "La personalidad",
    sectionPersonalityBody:
      "Clara habla rioplatense. Usa vos, decime, contame. Es directa, breve, profesional. No usa emojis cada dos palabras ni te tira jergas de coach motivacional. Si te puede ahorrar drama, lo hace; si tiene que avisarte que estás gastando más de lo que entra, te lo dice claro.",
    sectionTechTitle: "El stack",
    sectionTechBody:
      "Next.js 16 (App Router) + Vercel AI SDK + Vercel AI Gateway con varios proveedores LLM en zero data retention. Postgres con Prisma para persistir todo. Servidor MCP para que cualquier asistente externo (Claude, Cursor, ChatGPT) hable con Clara.",
    sectionTeamTitle: "El equipo",
    sectionTeamBody:
      "Clara la armamos en Trefolio. Open source MIT, sin telemetría, sin precio por usuario. La intención es que la uses gratis, y si querés self-hostearla, lo hagas en cinco minutos en tu propio Vercel.",
    sectionTeamLinkRepo: "Repositorio en GitHub",
    sectionTeamLinkOrg: "trefolio.com",
    cta: "Empezar gratis",
    ctaSecondary: "Ver features",
  },

  marketingFaqPage: {
    metaTitle: "FAQ",
    metaDescription:
      "Preguntas frecuentes sobre Clara: precio, idiomas, bancos, integraciones con Claude/Cursor/ChatGPT, self-hosting y privacidad.",
    chip: "Preguntas frecuentes",
    title: "Resolvamos",
    titleHighlight: "las dudas",
    intro:
      "Si necesitás más detalles, abrí un issue en GitHub o miramos juntos en el chat con Clara.",
    cta: "Empezar gratis",
    ctaSecondary: "Ver changelog",
  },

  marketingChangelogPage: {
    metaTitle: "Changelog",
    metaDescription:
      "Historia de cambios y releases de Clara — open source, MIT, hecha en público.",
    chip: "Historia de releases",
    title: "Lo que vino",
    titleHighlight: "antes",
    intro:
      "Cambios visibles, en público. Cada versión apunta a lo más importante; el detalle vive en los commits del repo.",
    publishedOn: (date: string) => `Publicado el ${date}`,
    cta: "Empezar gratis",
    ctaSecondary: "Ver el repo",
  },

  marketingPrivacyPage: {
    metaTitle: "Privacidad",
    metaDescription:
      "Qué datos guarda Clara, qué hace y qué no hace con ellos. Sin telemetría, sin venta de datos, IA con zero data retention.",
    chip: "Privacidad",
    title: "Tu plata,",
    titleHighlight: "tu data",
    titleSuffix: ".",
    intro:
      "Clara está pensada para que tu información financiera te siga perteneciendo. Esto es lo que recolectamos, lo que no, y cómo procesamos cada cosa.",
    cta: "Empezar gratis",
    ctaSecondary: "Ver código",
  },

  auth: {
    loginTitle: "Iniciá sesión en Clara",
    loginSubtitle: "Volvé a tu balance financiero personalizado.",
    registerTitle: "Crear cuenta en Clara",
    registerSubtitle:
      "Tu money coach con IA: planificá gastos, conectá tu banco y mandá notas de voz.",
    email: "Correo electrónico",
    password: "Contraseña",
    passwordMin: "Mínimo 8 caracteres",
    confirmPassword: "Confirmar contraseña",
    submitLogin: "Iniciar sesión",
    submitRegister: "Crear cuenta",
    submittingLogin: "Iniciando…",
    submittingRegister: "Creando…",
    googleContinue: "Continuar con Google",
    or: "o",
    haveAccount: "¿Ya tenés cuenta?",
    noAccount: "¿Todavía no tenés cuenta?",
    goToLogin: "Iniciá sesión",
    goToRegister: "Crear cuenta",
    forgotPassword: "¿Olvidaste la contraseña?",
    backHome: "Volver a la home",
    errorInvalid: "Correo o contraseña incorrectos.",
    errorAccountDisabled:
      "Tu cuenta está deshabilitada. Si pensás que es un error, escribinos.",
    errorAccessDenied:
      "Necesitamos un correo verificado por Google para entrar. Probá con otro proveedor.",
    errorPasswordMismatch: "Las contraseñas no coinciden.",
    errorRegisterFailed: "No pudimos crear la cuenta. Probá de nuevo.",
    errorLoginFailed: "No se pudo iniciar sesión.",
    verifyEmailTitle: "Confirmá tu email",
    verifyEmailBody: (email: string) =>
      `Te mandamos un enlace a ${email}. Tocalo para activar tu cuenta y después podés iniciar sesión.`,
    verifyEmailMissingResend:
      "El servidor todavía no tiene Resend configurado, así que el enlace quedó en los logs del servidor. Pedile al admin que lo abra por vos o configurá RESEND_API_KEY.",
    verifyEmailSuccess:
      "Email confirmado. Ya podés iniciar sesión con tu contraseña.",
    showPassword: "Mostrar contraseña",
    hidePassword: "Ocultar contraseña",
    passkeyTitle: "Llaves de acceso",
    passkeyDescription:
      "Iniciá sesión con tu huella, Face ID o llave de seguridad. Más seguro que una contraseña y sin tener que tipear nada.",
    passkeyAdd: "Agregar passkey",
    passkeyAdding: "Creando…",
    passkeySignIn: "Iniciar sesión con passkey",
    passkeyVerifying: "Verificando…",
    passkeyEmpty: "Todavía no tenés passkeys.",
    passkeyAddedAt: (date: string) => `Agregada el ${date}`,
    passkeyLastUsed: (date: string) => `Última vez: ${date}`,
    passkeyNeverUsed: "Sin uso aún",
    passkeyDelete: "Borrar",
    passkeyRename: "Renombrar",
    passkeyRenamePlaceholder: "Nombre de la passkey",
    passkeyAddError: "No pudimos crear la passkey. Probá de nuevo.",
    passkeySignInError: "No pudimos iniciar sesión con la passkey.",
    passkeyUnsupported:
      "Tu navegador no soporta passkeys. Iniciá sesión con email y contraseña.",
  },

  errors: {
    appCrashTitle: "Algo se rompió.",
    appCrashBody:
      "Disculpá el bardo. Probá refrescar la página; si persiste, avisanos abriendo un issue.",
    appCrashRetry: "Reintentar",
    notFoundTitle: "Página no encontrada",
    notFoundBody:
      "Esta URL no existe. Volvé a la home o abrí Clara para seguir charlando.",
    notFoundCta: "Volver a la home",
    notFoundCtaApp: "Abrir Clara",
  },

  settings: {
    pageTitle: "Configuración",
    pageDescription:
      "Manejá tu cuenta, preferencias e integraciones de Clara en un solo lugar.",
    profileTitle: "Perfil",
    emailLabel: "Correo electrónico",
    currentPassword: "Contraseña actual",
    currentPasswordHintRequired: "(obligatoria para cambiarla)",
    currentPasswordHintOptional: "(opcional)",
    newPassword: "Nueva contraseña",
    setPassword: "Definir contraseña (opcional)",
    googleHint:
      "Entraste con Google. Podés agregar una contraseña si también querés iniciar sesión con correo y contraseña.",
    save: "Guardar",
    saved: "Cambios guardados.",
    cannotSave: "No se pudieron guardar los cambios.",

    languageTitle: "Idioma",
    languageDescription:
      "Idioma de la interfaz y del asistente Clara. También podés pedirle a Clara que cambie el idioma desde el chat.",
    languageOptionEs: "Español",
    languageOptionEn: "English",
    languageSaved: "Idioma actualizado.",
    languageError: "No se pudo actualizar el idioma.",

    accessTitle: "Formas de acceso",
    accessDescription:
      "Vinculá Google para entrar con un clic. Usá el mismo correo que esta cuenta para unificar tu perfil.",
    googleLinked: "Google está vinculado a esta cuenta.",
    connectGoogle: "Conectar Google",

    currencyTitle: "Moneda principal",
    currencyDescription:
      "Definí la moneda en la que querés ver totales, saldo, ingresos y balance. Podés registrar gastos en cualquier moneda: los convertimos a esta usando el tipo de cambio del momento (queda guardado por gasto, no se mueve después).",
    currencyIsoLabel: "Código ISO 4217",
    currencySave: "Guardar moneda",
    currencyConfirmed: (date: string) => `Confirmada el ${date}.`,
    currencyNotConfirmed:
      "Todavía no confirmaste la moneda. El asistente puede preguntarte la próxima vez que charlen.",
    currencyUpdated:
      "Moneda principal actualizada. Las líneas existentes mantienen su tipo de cambio original.",
    currencyInvalid:
      "Ingresá un código ISO 4217 de 3 letras (USD, ARS, EUR, …).",
    currencyError: "No se pudo guardar la moneda.",

    instructionsTitle: "Instrucciones para el asistente e importaciones",
    instructionsDescription:
      "Definí reglas en lenguaje natural: cómo categorizar ciertos comercios o convenciones que use el asistente en el chat y con fotos del banco. Podés pedirle al asistente en el chat que guarde una preferencia para más adelante; se escribe acá mismo.",
    instructionsPlaceholder:
      "Ej.: Supermercados siempre ALIMENTACION. Spotify y Netflix → SUSCRIPCIONES. Si veo \"Uber\", categorizar como TRANSPORTE.",
    instructionsHint: "Máximo 12.000 caracteres. Requiere",
    instructionsHintEnvSuffix: "en el servidor para que el asistente aplique las reglas.",
    instructionsSaveBtn: "Guardar instrucciones",
    instructionsSaved: "Instrucciones guardadas.",
    instructionsError: "No se pudo guardar.",

    apiTokensTitle: "Acceso para AI (MCP)",
    apiTokensDescription:
      "Generá tokens personales para conectar Clara a Claude Desktop, Cursor o cualquier cliente MCP. Los tokens se muestran solo una vez al crearlos.",
    apiTokensCreate: "Crear token",
    apiTokensCreating: "Creando…",
    apiTokensName: "Nombre",
    apiTokensExpiresAt: "Expira",
    apiTokensCreatedAt: "Creado",
    apiTokensLastUsedAt: "Último uso",
    apiTokensRevoke: "Revocar",
    apiTokensRevokeConfirm: "¿Revocar este token? Se desconecta cualquier cliente que lo esté usando.",
    apiTokensRevoked: "Token revocado.",
    apiTokensCreatePlaceholder: "Claude Desktop, Cursor, etc.",
    apiTokensExpiresHint: "Vacío = nunca expira.",
    apiTokensCreatedShort: (token: string) =>
      `Token creado. Copiá y pegá ahora: ${token}`,
    apiTokensCopy: "Copiar token",
    apiTokensCopied: "Copiado.",
    apiTokensEmpty: "Todavía no creaste ningún token.",
    apiTokensRevokedSuffix: " (revocado)",
    apiTokensExpired: " (expirado)",
    apiTokensNeverUsed: "Nunca",
    apiTokensExpireDateLabel: "Expira (opcional)",

    dangerSectionTitle: "Tu información y cuenta",
    dangerSectionDescription:
      "Descargá todos tus datos en formato JSON o borrá tu cuenta. Son derechos GDPR (Art. 15, 17 y 20).",

    exportTitle: "Descargar mis datos",
    exportDescription:
      "Generamos un JSON con todo lo que Clara guarda sobre vos: bancos, plantillas, gastos e ingresos por mes, ahorros, mensajes del chat (web y Telegram), pagos y suscripciones. No incluye tokens ni contraseñas (no son datos tuyos, son secretos de autenticación).",
    exportButton: "Descargar JSON",
    exportLimit: "Máximo 3 descargas por hora.",

    deleteTitle: "Borrar mi cuenta",
    deleteDescription:
      "Borra tu cuenta y todos los datos asociados (bancos, plantillas, mensajes, ahorros, tokens MCP, passkeys). Si tenés suscripción Supporter activa, la cancelamos en el momento. Las donaciones quedan registradas en Stripe para fines fiscales y no son reembolsables.",
    deleteWarning: "Esto es irreversible.",
    deletePasswordLabel: "Tu contraseña",
    deletePasswordHint: "Te la pedimos para confirmar que sos vos.",
    deletePhraseLabel: "Frase de confirmación",
    deletePhraseHint: (email: string) =>
      `Tipeá exactamente: BORRAR ${email}`,
    deleteSubmit: "Borrar mi cuenta",
    deleteSubmitting: "Borrando…",
    deleteFailed: "No se pudo borrar la cuenta.",
  },

  app: {
    welcomeBack: "¡Hola de nuevo!",
    chatLoading: "Cargando el chat…",
    devTools: "Dev tools",
  },

  banks: {
    pageTitle: "Bancos",
    pageDescription:
      "Las cuentas que usás para pagar tus gastos. Una plantilla siempre vive en un banco; podés mover gastos entre bancos cuando quieras.",
    addBank: "Agregar banco",
    nameLabel: "Nombre del banco",
    namePlaceholder: "Galicia, Visa, Efectivo, …",
    colorLabel: "Color",
    colorHint: "Elegí un color para identificarlo.",
    colorNone: "Sin color",
    save: "Guardar",
    saving: "Guardando…",
    duplicate: "Ya existe un banco con ese nombre.",
    saveError: "No se pudo guardar el banco.",
    edit: "Editar",
    editTitle: "Editar banco",
    delete: "Borrar",
    deleteConfirm: (name: string) => `¿Borrar el banco ${name}? Si tiene gastos no podemos borrarlo.`,
    deleteError: "No se pudo borrar el banco.",
    empty: "Todavía no agregaste bancos.",
  },

  expenses: {
    pageTitle: "Plantillas de gasto",
    pageDescription:
      "Las plantillas describen un gasto recurrente o puntual. Cada mes recibe una copia editable; tildás cuando lo pagás.",
    addExpense: "Agregar plantilla",
    name: "Nombre",
    amount: "Monto",
    bank: "Banco",
    isRecurring: "Recurrente",
    startMonth: "Mes inicial",
    endMonth: "Mes final",
    endMonthHint: "Vacío = sigue indefinidamente.",
    category: "Categoría",
    save: "Guardar",
    saving: "Guardando…",
    edit: "Editar",
    delete: "Borrar",
    deleteConfirm: (name: string) =>
      `¿Borrar la plantilla ${name}? Las líneas mensuales que ya estén creadas no se borran.`,
    saveError: "No se pudo guardar la plantilla.",
    deleteError: "No se pudo borrar la plantilla.",
    empty: "Todavía no creaste plantillas.",
    perMonth: "/mes",
    oneOff: "puntual",
    activeFrom: (m: string) => `Activa desde ${m}`,
    untilMonth: (m: string) => `hasta ${m}`,
    indefinite: "indefinida",
  },

  incomes: {
    pageTitle: "Plantillas de ingreso",
    pageDescription:
      "Las plantillas describen un ingreso recurrente (sueldo, alquiler que cobrás) o uno puntual (un freelance que ya sabés que va a entrar). Cada mes recibe una copia editable; tildás cuando entra la plata.",
    addIncome: "Agregar plantilla",
    name: "Nombre",
    amount: "Monto",
    bank: "Banco",
    isRecurring: "Recurrente",
    startMonth: "Mes inicial",
    endMonth: "Mes final",
    endMonthHint: "Vacío = sigue indefinidamente.",
    category: "Categoría",
    save: "Guardar",
    saving: "Guardando…",
    edit: "Editar",
    delete: "Borrar",
    deleteConfirm: (name: string) =>
      `¿Borrar la plantilla ${name}? Las líneas mensuales ya creadas no se borran.`,
    saveError: "No se pudo guardar la plantilla.",
    deleteError: "No se pudo borrar la plantilla.",
    empty: "Todavía no creaste plantillas de ingreso.",
    perMonth: "/mes",
    oneOff: "puntual",
    activeFrom: (m: string) => `Activa desde ${m}`,
    untilMonth: (m: string) => `hasta ${m}`,
    indefinite: "indefinida",
  },

  savings: {
    pageTitle: "Ahorros",
    pageDescription:
      "Tu pila global de ahorros y todos los movimientos: aportes mensuales, sobrantes derivados, coberturas de deuda y depósitos o retiros manuales.",
  },

  month: {
    drawerTitle: "Panel del mes",
    summaryIncome: "Ingreso",
    summaryCarryover: "Carryover",
    summaryPlanned: "Planificado",
    summaryPaid: "Pagado",
    summaryRemaining: "Pendiente",
    summaryBalance: "Balance",
    monthFor: (label: string) => `Mes · ${label}`,
    addLine: "Agregar gasto",
    addLineDialogTitle: "Nuevo gasto",
    addIncomeDialogTitle: "Nuevo cobro",
    incomesChronoTitle: "Cobros del mes",
    pendingIncomesFromTemplates: "Cobros pendientes desde plantillas",
    addIncomePlaceholderName: "Sueldo de junio",
    paid: "Pagado",
    unpaid: "Pendiente",
    markPaid: "Marcar como pagado",
    markUnpaid: "Marcar como pendiente",
    bankTotalsTitle: "Totales por banco",
    chronoTitle: "Líneas del mes",
    pendingFromTemplates: "Pendientes desde plantillas",
    addLinePlaceholderName: "Pizza con amigos",
    saveError: "No se pudo guardar la línea.",
    delete: "Borrar",
    deleteConfirm: "¿Borrar esta línea del mes?",
    notCreated: "El mes no está creado todavía.",
    createFromTemplates: "Crear el mes a partir de plantillas",
    createCopyFrom: (m: string) => `Copiar desde ${m}`,
    createBtn: "Crear mes",
    creating: "Creando…",
    incomePromptTitle: "¿Cuánto te entra este mes?",
    incomeSave: "Guardar ingreso",
    carryoverTitle: "Sobrante del mes anterior",
    carryoverBody: (amount: string, prev: string) =>
      `Cerraste ${prev} con ${amount} sin gastar. ¿Qué hacemos?`,
    carryoverAdd: "Sumar al ingreso",
    carryoverAside: "Dejarlo aparte como ahorros",
    deficitTitle: "Cerraste en rojo",
    deficitBody: (amount: string, prev: string, savings: string) =>
      `${prev} cerró con un saldo negativo de ${amount}. Tenés ${savings} en ahorros. ¿Cómo seguimos?`,
    deficitCover: "Cubrir con ahorros",
    deficitCarry: "Pasar la deuda a este mes",
    savingsCardTitle: "Aporte a ahorro",
    savingsCardEmpty: "Sin aporte registrado este mes.",
    savingsAddBtn: "Anotar aporte",
    savingsEditBtn: "Editar aporte",
    savingsRemoveBtn: "Quitar aporte",
    savingsContributionDialogTitle: "Aporte mensual a ahorro",
    savingsContributionHint:
      "Es informativo: declara cuánto dedicás a ahorro este mes. NO descuenta del balance.",
  },

  chat: {
    metaTitle: "Charlar con Clara",
    inputPlaceholder: "Escribí, dictá una nota de voz o tirá un PDF…",
    composerSend: "Enviar",
    composerStop: "Detener",
    attachLabel: "Adjuntar archivo",
    typingLabel: "Clara está escribiendo…",
    error: "Algo se rompió en el chat. Probá de nuevo.",
    quotaExceeded:
      "Llegaste al límite diario de mensajes. Volvé mañana o pedile a un admin que lo suba.",
    rateLimited: "Estás mandando muy rápido. Esperá unos segundos y reintentá.",
    rebooting: "Reiniciando…",
    confirmReset: "¿Borrar la conversación entera?",
    resetBtn: "Borrar chat",
    welcome: "¡Hola! Soy Clara, tu asistente financiera.",
    languageChangedToEs: "Listo, ahora hablamos en español.",
    languageChangedToEn: "Done — switching to English from now on.",
  },

  admin: {
    pageTitle: "Administración",
    pageDescription:
      "Gestión de usuarios: activar/desactivar cuentas y ajustar el límite diario del agente.",
    columnsEmail: "Correo",
    columnsActive: "Activo",
    columnsAdmin: "Admin",
    columnsLimit: "Límite diario",
    columnsToday: "Hoy",
    columnsTelegram: "Telegram",
    columnsCreated: "Creado",
    columnsActions: "Acciones",
    enable: "Activar",
    disable: "Desactivar",
    save: "Guardar",
    saving: "Guardando…",
    saved: "Guardado.",
    error: "No se pudo guardar.",
    empty: "Sin usuarios todavía.",
    analyticsLink: "Ver analytics",
    analyticsLinkDesc: "DAU, uso de IA, costos y ranking de usuarios.",
    featureFlagsTitle: "Feature flags",
    featureFlagsDescription:
      "Activá o desactivá funciones experimentales globalmente. Cada flag puede tener overrides por usuario desde la tabla de usuarios.",
    notifyTitle: "Notificar a un usuario",
    notifyDescription:
      "Mensaje fuera del agente para incidentes (downtime, recuperación, avisos puntuales). Prefiere Telegram cuando está vinculado, si no cae a email.",
  },

  analytics: {
    pageTitle: "Analytics",
    pageDescription:
      "Métricas de uso interno: usuarios activos, mensajes del agente y costos estimados.",
    rangeLabel: "Rango",
    range30: "30 días",
    range90: "90 días",
    range180: "180 días",
    rangeFormat: (from: string, to: string) => `${from} → ${to}`,
    kpiDau: "DAU (hoy)",
    kpiWau: "WAU (7 días)",
    kpiMau: "MAU (28 días)",
    kpiMessages: "Mensajes IA",
    kpiTokens: "Tokens",
    kpiCost: "Costo USD",
    kpiTokensInOut: (input: string, output: string) =>
      `${input} in / ${output} out`,
    activeChartTitle: "Usuarios activos",
    aiMessagesChartTitle: "Mensajes del agente por día",
    aiTokensChartTitle: "Tokens por día",
    aiCostChartTitle: "Costo estimado por día (USD)",
    byModelTitle: "Uso por modelo (últimos 30 días)",
    topUsersTitle: "Top usuarios IA (últimos 30 días)",
    columnsModel: "Modelo",
    columnsMessages: "Mensajes",
    columnsInput: "Tokens in",
    columnsOutput: "Tokens out",
    columnsCost: "Costo",
    columnsUser: "Usuario",
    columnsTotalTokens: "Tokens totales",
    seriesDau: "DAU",
    seriesInputTokens: "Input",
    seriesOutputTokens: "Output",
    seriesMessages: "Mensajes",
    seriesCost: "USD",
    empty: "Sin datos en el rango seleccionado.",
    exportCsv: "Exportar CSV",
    exportDau: "DAU",
    exportAi: "Uso IA",
    exportByModel: "Por modelo",
    exportTopUsers: "Top usuarios",
  },

  pwa: {
    installTitle: "Instalá Clara en tu pantalla",
    installBody:
      "Clara funciona como app nativa: notificaciones, ícono y arranque rápido. Es opcional.",
    install: "Instalar",
    notNow: "Ahora no",
    iosHelp:
      "En iPhone tocá el botón de Compartir y elegí “Agregar a pantalla de inicio”.",
  },

  charts: {
    monthlyTitle: "Comparativo mensual",
    categoryTitle: "Distribución por categoría",
    bankTitle: "Distribución por banco",
    noData: "Sin datos para mostrar.",
  },

  units: {
    monthShort: (m: string) => m,
  },
};

export type Dict = typeof es;
