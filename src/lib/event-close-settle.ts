import {
  EventAttributionMode,
  UserKind,
  type EventStatus,
} from "@prisma/client";

import { db } from "@/lib/db";
import {
  closeEvent as closeEventService,
  computeSettlement,
  type EventPayload,
  type SettlementBreakdown,
} from "@/lib/events";
import { isLocale, type Locale } from "@/lib/i18n/locale";
import { log } from "@/lib/log";
import { sendTelegramMessage } from "@/lib/telegram/client";
import {
  guestUpgradeCta,
  settlementMessage,
} from "@/lib/telegram/event-share-strings";

/**
 * Close an event AND broadcast the settlement breakdown to every active
 * participant via Telegram (best-effort, errors swallowed). Used by both
 * the REST close endpoint and the AI tool.
 *
 * Why this lives in its own file (not `events.ts`): `events.ts` is pure
 * data-access and is imported by the AI agent toolset; pulling Telegram
 * into that import graph would be a circular nightmare and force the
 * MCP / tests to mock Telegram. Keeping the side-effecty wrapper here
 * means callers opt in.
 */
export async function closeEventAndSettle(args: {
  userId: string;
  eventId: string;
  mode: EventAttributionMode;
  attributionMonth?: string | null;
}): Promise<{
  event: EventPayload | null;
  settlement: SettlementBreakdown | null;
  notificationsSent: number;
}> {
  const event = await closeEventService({
    userId: args.userId,
    eventId: args.eventId,
    mode: args.mode,
    attributionMonth: args.attributionMonth ?? null,
  });
  if (!event) {
    return { event: null, settlement: null, notificationsSent: 0 };
  }

  const settlement = await computeSettlement(args.eventId);
  if (!settlement || settlement.participants.length <= 1) {
    // Solo / single-participant event: no settlement to broadcast.
    return { event, settlement, notificationsSent: 0 };
  }

  const participants = await db.eventParticipant.findMany({
    where: { eventId: args.eventId, removedAt: null },
    select: {
      userId: true,
      displayName: true,
      user: {
        select: {
          id: true,
          locale: true,
          kind: true,
          telegramChatId: true,
        },
      },
    },
  });

  let sent = 0;
  for (const p of participants) {
    if (!p.user.telegramChatId) continue;
    const locale: Locale = isLocale(p.user.locale)
      ? (p.user.locale as Locale)
      : "es";

    const me = settlement.participants.find((x) => x.userId === p.userId);
    if (!me) continue;

    const yourTransfers = settlement.transfers
      .filter(
        (t) => t.fromUserId === p.userId || t.toUserId === p.userId,
      )
      .map((t) =>
        t.fromUserId === p.userId
          ? {
              direction: "outgoing" as const,
              counterpartName: t.toDisplayName,
              amount: t.amount,
            }
          : {
              direction: "incoming" as const,
              counterpartName: t.fromDisplayName,
              amount: t.amount,
            },
      );
    const otherTransfers = settlement.transfers
      .filter(
        (t) => t.fromUserId !== p.userId && t.toUserId !== p.userId,
      )
      .map((t) => ({
        fromName: t.fromDisplayName,
        toName: t.toDisplayName,
        amount: t.amount,
      }));

    const text = settlementMessage(locale, {
      eventName: event.name,
      currency: settlement.currency,
      total: settlement.total,
      yourPaid: me.paid,
      yourShare: settlement.fairShare,
      yourBalance: me.balance,
      yourTransfers,
      otherTransfers,
    });

    let cta: string | null = null;
    if (p.user.kind === UserKind.GUEST) {
      cta = guestUpgradeCta(locale, {
        upgradeUrl: buildGuestUpgradeUrl(p.user.id, locale),
      });
    }

    try {
      await sendTelegramMessage(p.user.telegramChatId, text);
      if (cta) {
        await sendTelegramMessage(p.user.telegramChatId, cta);
      }
      sent += 1;
    } catch (error) {
      log.error("event_settle.telegram_send_failed", {
        eventId: args.eventId,
        userId: p.user.id,
        error: serializeError(error),
      });
    }
  }

  return { event, settlement, notificationsSent: sent };
}

function buildGuestUpgradeUrl(guestUserId: string, locale: Locale): string {
  const base =
    process.env.NEXTAUTH_URL?.replace(/\/+$/, "") ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return `${base}/${locale}/upgrade-guest?guest=${encodeURIComponent(guestUserId)}`;
}

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return error;
}

// Re-exported here so callers don't have to dual-import.
export type { EventStatus, EventAttributionMode } from "@prisma/client";
