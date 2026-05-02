/**
 * Daily Telegram nudge — runs once per hour via `/api/cron/daily-nudge` and
 * sends a short proactive message to users who linked Telegram, enabled the
 * nudge, and have NOT logged anything during their local day.
 *
 * Design choices ("why not X?"):
 * - One cron, run every hour; per user we check whether the user's local
 *   clock currently reads the nudge hour (`NUDGE_HOUR_LOCAL`, default 20).
 *   This lets every timezone get a message around 20:00 local with only
 *   one scheduler. No per-timezone fan-out, no sleep-until tricks.
 * - Idempotency is keyed on `User.telegramNudgeLastSentAt` being within the
 *   current local-day window. If the cron is retriggered (Vercel edge
 *   replay, manual kick) we never double-nudge.
 * - No history is loaded and no tools are exposed to the model — see
 *   `generateSystemInitiatedReply`. The user did not start this turn, so
 *   Clara cannot mutate their data "on her own".
 * - The reply does NOT consume the user's daily agent quota. The billing
 *   rationale is that the user did not ask for this message; counting it
 *   against their cap would penalise the quieter users.
 *
 * Complies with `.cursor/skills/automated-user-comms/SKILL.md` (cadence:
 * one message per user per surface per local day; Clara identifies as AI;
 * no financial advice) and `.cursor/skills/legal-advisor/SKILL.md` (data
 * minimisation: only `country` + `locale` reach the model, no line data).
 */

import { generateSystemInitiatedReply } from "@/lib/ai/run-expense-agent";
import { db } from "@/lib/db";
import { log } from "@/lib/log";
import { userLoggedFinancialActivityToday } from "@/lib/activity-today";
import { sendTelegramHtmlMessage } from "@/lib/telegram/client";
import {
  countryToTimezone,
  currentHourInTimezone,
  localDayBoundsInUtc,
  resolveLocaleForOutbound,
} from "@/lib/timezone";

/** Local hour (0-23) at which the nudge fires. Overridable for ops tuning. */
const NUDGE_HOUR_LOCAL = clampHour(process.env.NUDGE_HOUR_LOCAL) ?? 20;

/** Telegram Bot API allows ~30 msgs/sec globally; keep batches well below. */
const USER_BATCH_SIZE = 10;

function clampHour(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0 || n > 23) return null;
  return n;
}

export type RunDailyNudgeStats = {
  consideredUsers: number;
  skippedWrongHour: number;
  skippedAlreadySentToday: number;
  skippedHasActivity: number;
  skippedNoContent: number;
  sent: number;
  failed: number;
};

type NudgeCandidate = {
  id: string;
  locale: string;
  country: string | null;
  telegramChatId: bigint | null;
  telegramNudgeLastSentAt: Date | null;
};

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return String(error);
}

function buildNudgePrompt(locale: "es" | "en"): string {
  if (locale === "en") {
    return [
      "It is 20:00 local time. The user has not logged any income, expense or savings movement today.",
      "Send a short proactive Telegram message (1-3 sentences) asking whether they have anything to log today.",
      "Be warm but respectful of the interruption. Do not mention other users, prior conversations or specific amounts.",
      "End by inviting them to reply here with whatever they want to log.",
    ].join("\n");
  }
  return [
    "Son las 20:00 en la hora local del usuario. No cargó ningún ingreso, gasto ni movimiento de ahorro en el día.",
    "Mandale un mensaje corto proactivo por Telegram (1-3 oraciones) preguntándole si tiene algo para registrar hoy.",
    "Cálido pero respetuoso de la interrupción. No menciones a otros usuarios, conversaciones previas ni montos específicos.",
    "Cerrá invitándolo a responderte por acá con lo que quiera cargar.",
  ].join("\n");
}

/**
 * Fallback copy when the AI call fails. Deterministic, localized, and
 * safe to read aloud — same shape as what the agent would have produced.
 */
function fallbackNudgeText(locale: "es" | "en"): string {
  if (locale === "en") {
    return "Hi! Clara here. I did not see any income or expense from your side today — do you want to log anything quickly? I am here if you do.";
  }
  return "Hola, soy Clara. Hoy no vi que cargaras ni ingresos ni gastos — ¿querés registrar algo rápido? Acá estoy si querés.";
}

/**
 * Core loop. Exported so tests can drive it with mocked Prisma + Telegram.
 * `nowUtc` is injectable so tests can pin a specific instant.
 */
export async function runDailyNudge(
  nowUtc: Date = new Date(),
): Promise<RunDailyNudgeStats> {
  const stats: RunDailyNudgeStats = {
    consideredUsers: 0,
    skippedWrongHour: 0,
    skippedAlreadySentToday: 0,
    skippedHasActivity: 0,
    skippedNoContent: 0,
    sent: 0,
    failed: 0,
  };

  const candidates = (await db.user.findMany({
    where: {
      isActive: true,
      // Skip soft-deleted accounts: they're in the 30-day grace window and
      // the daily nudge would land in a chat the user is trying to leave.
      deletedAt: null,
      telegramChatId: { not: null },
      telegramVerifiedAt: { not: null },
      telegramNudgeEnabled: true,
    },
    select: {
      id: true,
      locale: true,
      country: true,
      telegramChatId: true,
      telegramNudgeLastSentAt: true,
    },
  })) as NudgeCandidate[];

  stats.consideredUsers = candidates.length;

  const batches: NudgeCandidate[][] = [];
  for (let i = 0; i < candidates.length; i += USER_BATCH_SIZE) {
    batches.push(candidates.slice(i, i + USER_BATCH_SIZE));
  }

  for (const batch of batches) {
    await Promise.allSettled(
      batch.map((user) => processCandidate(user, nowUtc, stats)),
    );
  }

  log.info("telegram.daily_nudge.finished", { ...stats });
  return stats;
}

async function processCandidate(
  user: NudgeCandidate,
  nowUtc: Date,
  stats: RunDailyNudgeStats,
): Promise<void> {
  try {
    const timezone = countryToTimezone(user.country);
    if (currentHourInTimezone(timezone, nowUtc) !== NUDGE_HOUR_LOCAL) {
      stats.skippedWrongHour += 1;
      return;
    }

    const { startUtc, endUtc } = localDayBoundsInUtc(timezone, nowUtc);

    if (
      user.telegramNudgeLastSentAt &&
      user.telegramNudgeLastSentAt >= startUtc &&
      user.telegramNudgeLastSentAt < endUtc
    ) {
      stats.skippedAlreadySentToday += 1;
      return;
    }

    const hasActivity = await userLoggedFinancialActivityToday(
      user.id,
      startUtc,
      endUtc,
    );
    if (hasActivity) {
      stats.skippedHasActivity += 1;
      return;
    }

    const locale = resolveLocaleForOutbound(user.locale);

    let text = "";
    try {
      const result = await generateSystemInitiatedReply({
        userId: user.id,
        locale,
        kind: "telegram_daily_nudge",
        prompt: buildNudgePrompt(locale),
      });
      text = result.text;
    } catch (error) {
      log.warn("telegram.daily_nudge.ai_fallback", {
        userId: user.id,
        error: serializeError(error),
      });
      text = fallbackNudgeText(locale);
    }

    if (!text) {
      stats.skippedNoContent += 1;
      return;
    }

    if (user.telegramChatId === null) {
      // Shouldn't happen given the query filter, but narrow the type.
      stats.skippedNoContent += 1;
      return;
    }

    await sendTelegramHtmlMessage(user.telegramChatId, text, {
      disableWebPagePreview: true,
    });

    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: { telegramNudgeLastSentAt: nowUtc },
      }),
      db.telegramMessage.create({
        data: {
          userId: user.id,
          role: "assistant",
          text: text.slice(0, 4000),
          chatId: user.telegramChatId,
          isGroup: false,
        },
      }),
    ]);

    stats.sent += 1;
    log.info("telegram.daily_nudge.sent", {
      userId: user.id,
      timezone,
      locale,
      textLen: text.length,
    });
  } catch (error) {
    stats.failed += 1;
    log.error("telegram.daily_nudge.user_error", {
      userId: user.id,
      error: serializeError(error),
    });
  }
}

/**
 * Verify the shared secret used by Vercel Cron to authenticate calls to
 * `/api/cron/*`. Vercel sends `Authorization: Bearer $CRON_SECRET` on
 * every invocation.
 *
 * We fail closed when the env var is missing: a deploy without a secret
 * means we have not yet wired this up in ops, and ignoring requests is
 * safer than processing them.
 */
export function verifyCronSecret(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization");
  if (!header) return false;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;
  const provided = match[1];
  if (provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < provided.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
