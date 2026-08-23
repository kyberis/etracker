import { NextResponse } from "next/server";

import { syncConnection } from "@/lib/bank-sync/sync-connection";
import { listActiveConnectionsForSync } from "@/lib/db/bank-connections";
import { pruneEnableBankingApiLogs } from "@/lib/db/enable-banking-logs";
import { isEnableBankingEnabled } from "@/lib/enable-banking/config";
import { jsonError } from "@/lib/http";
import { log } from "@/lib/log";
import { verifyCronSecret } from "@/lib/telegram/daily-nudge";

export const runtime = "nodejs";
export const maxDuration = 300;

async function handle(request: Request): Promise<Response> {
  if (!verifyCronSecret(request)) {
    log.warn("enable_banking.cron.unauthorized", {});
    return jsonError("Unauthorized.", 401);
  }

  if (!isEnableBankingEnabled()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "not_configured" });
  }

  const connections = await listActiveConnectionsForSync();
  const results = {
    attempted: 0,
    success: 0,
    error: 0,
    expired: 0,
    prunedLogs: 0,
  };

  for (const connection of connections) {
    if (connection.validUntil && connection.validUntil.getTime() < Date.now()) {
      results.expired += 1;
      continue;
    }
    results.attempted += 1;
    const outcome = await syncConnection({
      connectionId: connection.id,
      trigger: "cron",
    });
    if (outcome.status === "error") {
      results.error += 1;
      if (outcome.errorCode === "RATE_LIMIT") {
        // Skip remaining syncs this tick to respect ASPSP daily caps.
        break;
      }
    } else {
      results.success += 1;
    }
  }

  results.prunedLogs = await pruneEnableBankingApiLogs();
  log.info("enable_banking.cron.tick", results);
  return NextResponse.json({ ok: true, ...results });
}

export const POST = handle;
export const GET = handle;
