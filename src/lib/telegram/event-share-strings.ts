import type { Locale } from "@/lib/i18n/locale";

/**
 * Localized strings for the shared-event-wallet Telegram flow. Strings
 * live in their own module (rather than the main i18n dictionaries)
 * because they're used exclusively from server-side Telegram code; they
 * never need to ship to the browser.
 *
 * Keep these short and chat-native. Telegram messages get scanned by
 * eye in seconds, not paragraphs.
 */

export type GuestWelcomeArgs = {
  ownerDisplayName: string;
  eventName: string;
};

/**
 * Sent immediately after a brand-new GUEST taps Start with a
 * participant's `telegramLinkCode`. Sets expectations so the guest
 * knows the bot's job is restricted to this trip.
 */
export function guestWelcomeMessage(
  locale: Locale,
  args: GuestWelcomeArgs,
): string {
  if (locale === "en") {
    return [
      `Hi! ${args.ownerDisplayName} invited you to track expenses for *${args.eventName}* together on Clara.`,
      "",
      "Send me the trip's expenses in plain language (e.g. `60 USD gas`) and I'll log them.",
      "When someone pays for something, I'll ask which of you paid.",
    ].join("\n");
  }
  return [
    `¡Hola! ${args.ownerDisplayName} te invitó a llevar los gastos de *${args.eventName}* juntos en Clara.`,
    "",
    "Mandame los gastos del viaje en castellano (ej. `60 USD nafta`) y los voy cargando.",
    "Cuando alguien pague algo, te pregunto cuál de ustedes lo pagó.",
  ].join("\n");
}

/**
 * Sent when an EXISTING REGULAR user accepts a share-link via the web
 * landing while logged in (and their Telegram is already verified).
 * They already know the bot — we just acknowledge the new event.
 */
export function existingUserSharedEventWelcome(
  locale: Locale,
  args: GuestWelcomeArgs,
): string {
  if (locale === "en") {
    return `You joined *${args.eventName}* with ${args.ownerDisplayName}. Send the trip's expenses here; your day-to-day stays separate as always.`;
  }
  return `Te sumaste a *${args.eventName}* con ${args.ownerDisplayName}. Cargá los gastos del viaje por acá; los del día a día siguen separados como siempre.`;
}

export type SettlementMessageArgs = {
  eventName: string;
  currency: string;
  total: number;
  yourPaid: number;
  yourShare: number;
  /** Positive = you are owed, negative = you owe. */
  yourBalance: number;
  yourTransfers: Array<
    | { direction: "outgoing"; counterpartName: string; amount: number }
    | { direction: "incoming"; counterpartName: string; amount: number }
  >;
  otherTransfers: Array<{
    fromName: string;
    toName: string;
    amount: number;
  }>;
};

/**
 * Per-participant settlement summary sent at close time. We bias toward
 * line-by-line clarity over prose because Telegram strips most
 * formatting and a budget chat scrolls fast.
 */
export function settlementMessage(
  locale: Locale,
  args: SettlementMessageArgs,
): string {
  const { currency } = args;
  const fmt = (value: number) => formatMoney(value, currency);

  if (locale === "en") {
    const lines: string[] = [
      `*${args.eventName}* is closed.`,
      `Total: ${fmt(args.total)}`,
      `You paid: ${fmt(args.yourPaid)}`,
      `Your share: ${fmt(args.yourShare)}`,
      args.yourBalance >= 0
        ? `You're owed: ${fmt(Math.abs(args.yourBalance))}`
        : `You owe: ${fmt(Math.abs(args.yourBalance))}`,
    ];
    if (args.yourTransfers.length > 0) {
      lines.push("", "Your transfers:");
      for (const t of args.yourTransfers) {
        lines.push(
          t.direction === "outgoing"
            ? `• Pay ${t.counterpartName} ${fmt(t.amount)}`
            : `• ${t.counterpartName} pays you ${fmt(t.amount)}`,
        );
      }
    }
    if (args.otherTransfers.length > 0) {
      lines.push("", "Other transfers:");
      for (const t of args.otherTransfers) {
        lines.push(`• ${t.fromName} → ${t.toName}: ${fmt(t.amount)}`);
      }
    }
    return lines.join("\n");
  }

  const lines: string[] = [
    `Cerramos *${args.eventName}*.`,
    `Total: ${fmt(args.total)}`,
    `Pagaste: ${fmt(args.yourPaid)}`,
    `Te toca poner: ${fmt(args.yourShare)}`,
    args.yourBalance >= 0
      ? `Saldo a favor: ${fmt(Math.abs(args.yourBalance))}`
      : `Tenés que poner: ${fmt(Math.abs(args.yourBalance))}`,
  ];
  if (args.yourTransfers.length > 0) {
    lines.push("", "Tus movimientos:");
    for (const t of args.yourTransfers) {
      lines.push(
        t.direction === "outgoing"
          ? `• Pagale a ${t.counterpartName} ${fmt(t.amount)}`
          : `• ${t.counterpartName} te paga ${fmt(t.amount)}`,
      );
    }
  }
  if (args.otherTransfers.length > 0) {
    lines.push("", "Otros movimientos:");
    for (const t of args.otherTransfers) {
      lines.push(`• ${t.fromName} → ${t.toName}: ${fmt(t.amount)}`);
    }
  }
  return lines.join("\n");
}

/**
 * Upgrade CTA appended to the settlement message ONLY for GUEST
 * participants. Direct, single-line action: keep the friction at
 * tap-the-link levels.
 */
export function guestUpgradeCta(
  locale: Locale,
  args: { upgradeUrl: string },
): string {
  if (locale === "en") {
    return `Want to keep this trip and start tracking your day-to-day with Clara? Create your account in 2 minutes → ${args.upgradeUrl}`;
  }
  return `¿Querés guardar este viaje y empezar a llevar tu día a día con Clara? Creá tu cuenta en 2 minutos → ${args.upgradeUrl}`;
}

/**
 * Prompt the bot sends when an addMonthLine call from a multi-participant
 * shared event is missing `paidByUserId`. Lists participant names so the
 * user can answer with one of them (or "yo" / "me").
 */
export function whoPaidPrompt(
  locale: Locale,
  args: { participantNames: string[] },
): string {
  const names = args.participantNames.join(" / ");
  if (locale === "en") {
    return `Quick question — who paid for this one? (${names})`;
  }
  return `Una pregunta — ¿quién pagó esto? (${names})`;
}

function formatMoney(value: number, currency: string): string {
  // We don't pull in Intl just for two strings; fixed-2 keeps it
  // deterministic in tests too.
  const formatted = Math.abs(value).toFixed(2);
  return `${currency} ${formatted}`;
}
