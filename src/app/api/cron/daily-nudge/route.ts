/**
 * Vercel Cron entrypoint for the daily Telegram nudge.
 *
 * Scheduled every hour via `vercel.json`. On each tick we scan all linked
 * users, keep only the ones whose local clock currently reads the nudge
 * hour, and send a short AI-composed Telegram message to those who have
 * not logged any financial activity during their local day.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (Vercel Cron injects this).
 * Returns a small stats object so ops can eyeball it in the dashboard.
 */

import { NextResponse } from "next/server";

import { jsonError } from "@/lib/http";
import { log } from "@/lib/log";
import { runDailyNudge, verifyCronSecret } from "@/lib/telegram/daily-nudge";

export const runtime = "nodejs";
// The cron loops over users serially-batched; 5 minutes is the current
// platform cap and leaves plenty of headroom until we need sharding.
export const maxDuration = 300;

/**
 * Vercel's scheduler POSTs on every tick. We also accept GET so a human
 * can curl the endpoint with the secret for manual smoke tests.
 */
async function handle(request: Request): Promise<Response> {
  if (!verifyCronSecret(request)) {
    log.warn("telegram.daily_nudge.unauthorized", {});
    return jsonError("Unauthorized.", 401);
  }

  try {
    const stats = await runDailyNudge(new Date());
    return NextResponse.json({ ok: true, ...stats });
  } catch (error) {
    log.error("telegram.daily_nudge.run_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return jsonError("Daily nudge run failed.", 500);
  }
}

export const POST = handle;
export const GET = handle;
