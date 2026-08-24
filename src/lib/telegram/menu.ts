import type { Locale } from "@/lib/i18n/locale";

import type { InlineKeyboardMarkup } from "./client";

/**
 * Slash-command catalogue Telegram clients show under the "/" menu. We push
 * these lists to the Bot API once at deploy time via the setup script
 * (`scripts/setup-telegram-webhook.ts`); changing them here and re-running the
 * script is the only way to update the visible menu.
 *
 * The Bot API's `setMyCommands` accepts a `language_code` so each user sees
 * the descriptions in their Telegram client's language. We register one set
 * for the global default (`en`, used when no language matches) and one
 * specifically for Spanish (`language_code: "es"`).
 */
export type TelegramBotCommand = { command: string; description: string };

export const TELEGRAM_BOT_COMMANDS_BY_LOCALE: Record<
  Locale,
  TelegramBotCommand[]
> = {
  en: [
    { command: "start", description: "Start chat with Clara" },
    { command: "help", description: "Help" },
    { command: "menu", description: "Show quick actions" },
    { command: "unlink", description: "Unlink account" },
  ],
  es: [
    { command: "start", description: "Empezar a chatear con Clara" },
    { command: "help", description: "Ayuda" },
    { command: "menu", description: "Mostrar opciones" },
    { command: "unlink", description: "Desvincular cuenta" },
  ],
};

/**
 * Backwards-compat: callers that haven't been updated to the per-locale API
 * still get the English (global default) catalogue.
 */
export const TELEGRAM_BOT_COMMANDS: TelegramBotCommand[] =
  TELEGRAM_BOT_COMMANDS_BY_LOCALE.en;

/**
 * Localised strings for the welcome messages and inline-keyboard labels. We
 * only need a handful of strings here; the agent reply itself flows through
 * `generateExpenseAgentReply` and uses the Spanish/English system prompts
 * Clara already ships.
 */
type MenuStringKey =
  | "welcomeLinked"
  | "welcomeAlreadyLinked"
  | "welcomeNotLinked"
  | "linkExpired"
  | "linkInvalid"
  | "unlinkDone"
  | "unsupportedMedia"
  | "noFile"
  | "imageDownloadFailed"
  | "audioDownloadFailed"
  | "voiceNotePrefix"
  | "processThisCapture"
  | "imagePlaceholder"
  | "agentError"
  | "accountDisabled"
  | "groupNotice"
  | "menuTitle"
  | "menuMonth"
  | "menuAddExpense"
  | "menuSummary"
  | "menuLanguage"
  | "setupKickoffPrompt"
  | "pdfTooLarge"
  | "pdfDownloadFailed"
  | "pdfExtractFailed"
  | "pdfAttachmentIntro"
  | "csvTooLarge"
  | "csvDownloadFailed"
  | "csvReadFailed"
  | "csvAttachmentIntro";

/**
 * Synthetic user message we feed the agent on the very first Telegram turn
 * for an unset-up account. The system prompt knows how to interpret it (see
 * `setupGuideBlock` in `src/lib/ai/run-expense-agent.ts`) and replies with a
 * warm welcome + concrete examples instead of waiting for the user to type.
 *
 * Exposed so tests and the webhook can reference the exact same string.
 */
export const TELEGRAM_SETUP_KICKOFF_TOKEN = "__telegram_setup_kickoff__";

const STRINGS: Record<Locale, Record<MenuStringKey, string>> = {
  es: {
    welcomeLinked:
      "Listo, vinculé tu Telegram a tu cuenta de Clara. Decime qué querés saber del mes, mandame una captura del banco, un PDF/CSV del home banking o una nota de voz.",
    welcomeAlreadyLinked:
      "Ya estás vinculado. Mandame un mensaje y arrancamos.",
    welcomeNotLinked:
      "Hola, soy Clara. Para que pueda ayudarte con tu plata, primero vinculá este chat a tu cuenta. Generá el deep link en la web (Configuración → Integraciones → Telegram).",
    linkExpired:
      "Este link de vinculación venció. Volvé a generarlo desde Configuración → Telegram en la web.",
    linkInvalid:
      "Este link no es válido. Generalo de nuevo desde Configuración → Telegram en la web.",
    unlinkDone:
      "Listo, desvinculé este chat. Cuando quieras volver, generá el link desde Configuración.",
    unsupportedMedia:
      "Por ahora proceso texto, fotos, notas de voz, PDFs y CSVs del banco. Este tipo de archivo no lo puedo usar.",
    noFile: "No recibí el archivo. ¿Lo mandás de nuevo?",
    imageDownloadFailed:
      "No pude descargar la imagen, ¿la mandás de nuevo?",
    audioDownloadFailed:
      "No pude descargar el audio, ¿lo mandás de nuevo?",
    voiceNotePrefix: "Nota de voz",
    processThisCapture: "Procesá esta captura.",
    imagePlaceholder: "[imagen]",
    agentError:
      "Tuve un problema procesando tu mensaje. Probá de nuevo en un momento.",
    accountDisabled:
      "Tu cuenta de Clara está desactivada. Contactá al administrador para reactivarla.",
    groupNotice:
      "Por ahora solo respondo en chats privados. Mandame mensaje directo y seguimos.",
    menuTitle: "¿Qué querés hacer?",
    menuMonth: "Ver el mes",
    menuAddExpense: "Cargar un gasto",
    menuSummary: "Resumen del mes",
    menuLanguage: "Cambiar idioma",
    setupKickoffPrompt: TELEGRAM_SETUP_KICKOFF_TOKEN,
    pdfTooLarge:
      "El PDF supera los 12 MB. Mandame uno más chico o una captura del extracto.",
    pdfDownloadFailed:
      "No pude descargar el PDF, ¿lo mandás de nuevo?",
    pdfExtractFailed:
      "No pude leer el PDF (¿escaneo sin OCR, contraseña o archivo dañado?). Probá una captura o un export CSV.",
    pdfAttachmentIntro:
      "Te adjunto un PDF: texto cuando el archivo tiene capa de texto, y/o páginas renderizadas como imagen si era escaneo. Tratalo como extracto bancario; respetá mis instrucciones personales. Si está claro, cargá todos los movimientos claros de una (sin preguntar '¿sigo con la siguiente tanda?'); preguntá solo si tenés dudas reales.",
    csvTooLarge:
      "El CSV supera los 12 MB. Mandame uno más chico o pegá el extracto como texto en el chat.",
    csvDownloadFailed:
      "No pude descargar el CSV, ¿lo mandás de nuevo?",
    csvReadFailed:
      "No pude leer el CSV (¿encoding raro o archivo dañado?). Probá re-exportarlo en UTF-8 o pegá las filas como texto.",
    csvAttachmentIntro:
      "Te adjunto movimientos exportados del banco (CSV). Usá la lista que sigue; respetá mis instrucciones personales si las hay. Si está claro, cargá todos los movimientos claros de una (sin preguntar '¿sigo con la siguiente tanda?'); preguntá solo si tenés dudas reales.",
  },
  en: {
    welcomeLinked:
      "Done, this Telegram chat is now linked to your Clara account. Ask me anything about the month, or send a bank screenshot, PDF/CSV export or a voice note.",
    welcomeAlreadyLinked: "You're already linked. Send me a message and we begin.",
    welcomeNotLinked:
      "Hi, I'm Clara. To help you with your money, link this chat to your account first. Generate the deep link in the web app (Settings → Integrations → Telegram).",
    linkExpired:
      "This link expired. Generate a new one from Settings → Telegram in the web app.",
    linkInvalid:
      "This link is not valid. Generate it again from Settings → Telegram in the web app.",
    unlinkDone:
      "Done, this chat is unlinked. When you want to come back, generate the link from Settings.",
    unsupportedMedia:
      "For now I can process text, photos, voice notes, bank PDFs and CSVs. I can't use this file type.",
    noFile: "I didn't get the file. Can you send it again?",
    imageDownloadFailed:
      "I couldn't download the image. Can you send it again?",
    audioDownloadFailed:
      "I couldn't download the audio. Can you send it again?",
    voiceNotePrefix: "Voice note",
    processThisCapture: "Process this screenshot.",
    imagePlaceholder: "[image]",
    agentError:
      "I had a problem processing your message. Try again in a moment.",
    accountDisabled:
      "Your Clara account is disabled. Contact the administrator to reactivate it.",
    groupNotice:
      "For now I only reply in private chats. Send me a direct message and we'll continue.",
    menuTitle: "What do you want to do?",
    menuMonth: "View the month",
    menuAddExpense: "Add an expense",
    menuSummary: "Monthly summary",
    menuLanguage: "Change language",
    setupKickoffPrompt: TELEGRAM_SETUP_KICKOFF_TOKEN,
    pdfTooLarge:
      "The PDF is over 12 MB. Send a smaller file or a screenshot of the statement.",
    pdfDownloadFailed: "I couldn't download the PDF. Can you send it again?",
    pdfExtractFailed:
      "I couldn't read the PDF (scan without OCR, password-protected or corrupted file?). Try a screenshot or a CSV export.",
    pdfAttachmentIntro:
      "I'm attaching a PDF: text when the file has a text layer, and/or pages rendered as images if it was a scan. Treat it as a bank statement; respect my personal instructions. If it's clear, load every clear movement in one go (don't ask 'shall I continue with the next batch?'); ask only when you have real doubts.",
    csvTooLarge:
      "The CSV is over 12 MB. Send a smaller file or paste the statement as text in the chat.",
    csvDownloadFailed: "I couldn't download the CSV. Can you send it again?",
    csvReadFailed:
      "I couldn't read the CSV (unusual encoding or corrupted file?). Try re-exporting as UTF-8 or paste the rows as text.",
    csvAttachmentIntro:
      "I'm attaching bank-exported movements (CSV). Use the list below; respect my personal instructions if any. If it's clear, load every clear movement in one go (don't ask 'shall I continue with the next batch?'); ask only when you have real doubts.",
  },
};

export function getTelegramStrings(locale: Locale) {
  return STRINGS[locale];
}

/**
 * Inline keyboard rendered under the welcome / `/menu` reply. The
 * `callback_data` strings are short tags the webhook translates into
 * canned user prompts before forwarding to the agent — that way the AI
 * sees the same input it would for a typed question and reuses every tool
 * it already has, with no separate "menu router" code path.
 */
export function buildMenuKeyboard(locale: Locale): InlineKeyboardMarkup {
  const t = STRINGS[locale];
  return {
    inline_keyboard: [
      [
        { text: t.menuMonth, callback_data: "menu:month" },
        { text: t.menuSummary, callback_data: "menu:summary" },
      ],
      [
        { text: t.menuAddExpense, callback_data: "menu:add" },
        { text: t.menuLanguage, callback_data: "menu:language" },
      ],
    ],
  };
}

/**
 * Map a `callback_data` string from a menu tap to the user-facing text the
 * agent should treat as if the user had typed it. Localised so the AI replies
 * in the right language; rioplatense for ES.
 */
export function callbackToPrompt(
  data: string,
  locale: Locale,
): string | null {
  switch (data) {
    case "menu:month":
      return locale === "en"
        ? "Show me my current month."
        : "Mostrame el mes actual.";
    case "menu:summary":
      return locale === "en"
        ? "Give me a summary of this month."
        : "Hacéme un resumen de este mes.";
    case "menu:add":
      return locale === "en"
        ? "I want to add an expense — guide me."
        : "Quiero cargar un gasto, ayudame.";
    case "menu:language":
      return locale === "en"
        ? "Change the language to Spanish (rioplatense)."
        : "Cambiar el idioma a inglés.";
    default:
      return null;
  }
}
