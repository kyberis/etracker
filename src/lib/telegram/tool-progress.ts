/**
 * Friendly, locale-aware progress labels for each agent tool. Used by the
 * Telegram webhook to edit a single status message in place as the agent
 * runs ("Anotando el gasto…", "Buscando tus bancos…"), so the user
 * perceives forward motion instead of a silent typing dot.
 *
 * Keep these short (≤ ~40 chars). Telegram renders them on a single line.
 * Plain text — no Markdown — so the bot doesn't have to escape anything
 * for a cosmetic line.
 */

import type { Locale } from "@/lib/i18n/locale";

type LocaleMap = Record<Locale, string>;

/** Shown immediately on receipt, before any tool has been called. */
export const STATUS_THINKING: LocaleMap = {
  es: "💭 Pensando…",
  en: "💭 Thinking…",
};

/** Fallback for tools we haven't curated yet. */
const STATUS_WORKING: LocaleMap = {
  es: "⚙️ Procesando…",
  en: "⚙️ Working on it…",
};

/**
 * Per-tool labels in user voice. Rioplatense for ES (matches Clara's tone)
 * and neutral conversational EN. New tools fall back to STATUS_WORKING via
 * `toolProgressLabel` so shipping a tool never blocks on this file.
 */
const TOOL_LABELS: Record<string, LocaleMap> = {
  // Read-only lookups
  getMonthState: { es: "📊 Revisando tu mes…", en: "📊 Checking your month…" },
  listBanks: { es: "🏦 Consultando tus bancos…", en: "🏦 Looking up your banks…" },
  listExpenseTemplates: {
    es: "📋 Revisando tus plantillas de gasto…",
    en: "📋 Checking expense templates…",
  },
  listIncomeTemplates: {
    es: "📋 Revisando tus plantillas de ingreso…",
    en: "📋 Checking income templates…",
  },
  getSavingsState: { es: "🪙 Mirando tu pila de ahorros…", en: "🪙 Checking your savings…" },
  getFxRate: { es: "💱 Consultando el tipo de cambio…", en: "💱 Checking exchange rate…" },
  listEvents: { es: "🧳 Revisando tus billeteras…", en: "🧳 Checking your wallets…" },
  getActiveEvents: { es: "🧳 Buscando billeteras activas…", en: "🧳 Looking up active wallets…" },
  getEvent: { es: "🧳 Mirando la billetera…", en: "🧳 Checking the wallet…" },
  listEventParticipants: { es: "👥 Mirando los participantes…", en: "👥 Checking participants…" },

  // Mutations: banks
  createBank: { es: "🏦 Creando el banco…", en: "🏦 Creating the bank…" },
  updateBank: { es: "🏦 Actualizando el banco…", en: "🏦 Updating the bank…" },
  deleteBank: { es: "🏦 Borrando el banco…", en: "🏦 Deleting the bank…" },

  // Mutations: expenses
  createExpenseTemplate: {
    es: "📝 Creando plantilla de gasto…",
    en: "📝 Creating expense template…",
  },
  updateExpenseTemplate: {
    es: "📝 Actualizando plantilla…",
    en: "📝 Updating expense template…",
  },
  deleteExpenseTemplate: {
    es: "📝 Borrando plantilla de gasto…",
    en: "📝 Deleting expense template…",
  },
  addMonthLine: { es: "💸 Anotando el gasto…", en: "💸 Logging the expense…" },
  updateMonthLine: { es: "💸 Actualizando el gasto…", en: "💸 Updating the expense…" },
  deleteMonthLine: { es: "💸 Borrando el gasto…", en: "💸 Deleting the expense…" },

  // Mutations: income
  createIncomeTemplate: {
    es: "📈 Creando plantilla de ingreso…",
    en: "📈 Creating income template…",
  },
  updateIncomeTemplate: {
    es: "📈 Actualizando plantilla de ingreso…",
    en: "📈 Updating income template…",
  },
  deleteIncomeTemplate: {
    es: "📈 Borrando plantilla de ingreso…",
    en: "📈 Deleting income template…",
  },
  addIncomeLine: { es: "💵 Anotando el ingreso…", en: "💵 Logging income…" },
  updateIncomeLine: { es: "💵 Actualizando el ingreso…", en: "💵 Updating income…" },
  deleteIncomeLine: { es: "💵 Borrando el ingreso…", en: "💵 Deleting income…" },

  // Month admin
  createMonthIfNeeded: { es: "🗓️ Armando el mes…", en: "🗓️ Setting up the month…" },
  mergePendingTemplates: { es: "🔀 Fusionando plantillas…", en: "🔀 Merging templates…" },
  applyPrevMonthLeftover: {
    es: "↪️ Aplicando saldo del mes anterior…",
    en: "↪️ Applying last month's leftover…",
  },

  // Savings
  addSavingsMovement: { es: "🪙 Ajustando los ahorros…", en: "🪙 Updating savings…" },
  deleteSavingsMovement: { es: "🪙 Borrando movimiento de ahorros…", en: "🪙 Deleting savings entry…" },
  dedupeSavingsMovements: { es: "🪙 Buscando duplicados de ahorros…", en: "🪙 Finding savings duplicates…" },
  setMonthlySavingsContribution: {
    es: "🪙 Anotando aporte mensual…",
    en: "🪙 Logging monthly contribution…",
  },
  removeMonthlySavingsContribution: {
    es: "🪙 Borrando aporte mensual…",
    en: "🪙 Removing monthly contribution…",
  },

  // Settings
  setUserLocale: { es: "🌐 Cambiando el idioma…", en: "🌐 Switching language…" },
  setPrimaryCurrency: { es: "💱 Configurando tu moneda…", en: "💱 Setting your currency…" },
  updateExpenseImportInstructions: {
    es: "⚙️ Guardando tus reglas de importación…",
    en: "⚙️ Saving your import rules…",
  },

  // Events
  createEvent: { es: "🧳 Armando la billetera…", en: "🧳 Creating the wallet…" },
  updateEvent: { es: "🧳 Actualizando la billetera…", en: "🧳 Updating the wallet…" },
  closeEvent: { es: "🧳 Cerrando la billetera…", en: "🧳 Closing the wallet…" },
  reopenEvent: { es: "🧳 Reabriendo la billetera…", en: "🧳 Reopening the wallet…" },
  deleteEvent: { es: "🧳 Borrando la billetera…", en: "🧳 Deleting the wallet…" },
  attachLineToEvent: { es: "🧳 Sumando al viaje…", en: "🧳 Adding to the trip…" },
  detachLineFromEvent: { es: "🧳 Sacando del viaje…", en: "🧳 Removing from the trip…" },

  // Charts
  renderChart: { es: "📈 Preparando gráfico…", en: "📈 Preparing chart…" },
};

/**
 * Resolve a friendly status line for a given tool name. Falls back to a
 * generic "Working on it…" when the tool isn't in the curated list, so new
 * tools never block shipping.
 */
export function toolProgressLabel(toolName: string, locale: Locale): string {
  const map = TOOL_LABELS[toolName];
  if (map) return map[locale] ?? map.en;
  return STATUS_WORKING[locale] ?? STATUS_WORKING.en;
}

/** Initial "Thinking…" line shown before the first tool call. */
export function initialThinkingLabel(locale: Locale): string {
  return STATUS_THINKING[locale] ?? STATUS_THINKING.en;
}
