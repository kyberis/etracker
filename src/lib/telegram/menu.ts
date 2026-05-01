import type { Locale } from "@/lib/i18n/locale";

import type { InlineKeyboardMarkup } from "./client";

/**
 * Slash-command catalogue Telegram clients show under the "/" menu. We push
 * this list to the Bot API once at deploy time via the setup script
 * (`scripts/setup-telegram-webhook.ts`); changing it here and re-running the
 * script is the only way to update the visible menu.
 */
export const TELEGRAM_BOT_COMMANDS: { command: string; description: string }[] = [
  { command: "start", description: "Empezar / Start chat with Clara" },
  { command: "help", description: "Ayuda / Help" },
  { command: "menu", description: "Mostrar opciones / Show quick actions" },
  { command: "unlink", description: "Desvincular cuenta / Unlink account" },
];

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
  | "setupKickoffPrompt";

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
      "Listo, vinculé tu Telegram a tu cuenta de Clara. Decime qué querés saber del mes, mandame una captura del banco o una nota de voz.",
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
      "Por ahora proceso texto, fotos y mensajes de voz. Este tipo de archivo no lo puedo usar.",
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
  },
  en: {
    welcomeLinked:
      "Done, this Telegram chat is now linked to your Clara account. Ask me anything about the month, or send me a bank screenshot or a voice note.",
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
      "For now I can only process text, photos and voice messages. I can't use this file type.",
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
