import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { log } from "@/lib/log";

const MAX_JSON_CHARS = 500_000;
const RETENTION_DAYS = 30;

export type EnableBankingApiAction =
  | "listAspsps"
  | "startAuth"
  | "createSession"
  | "getSession"
  | "listBalances"
  | "listTransactions";

export type InsertApiLogParams = {
  userId: string;
  connectionId?: string | null;
  action: string;
  status: "success" | "error";
  httpStatus?: number | null;
  requestSummary?: Record<string, unknown>;
  responseSummary?: Record<string, unknown>;
  errorMessage?: string | null;
  durationMs: number;
};

function clipJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  try {
    let text = JSON.stringify(value);
    if (text.length > MAX_JSON_CHARS) {
      text = `${text.slice(0, MAX_JSON_CHARS)}…[truncated]`;
      return { truncated: true, preview: text };
    }
    return JSON.parse(text) as Prisma.InputJsonValue;
  } catch {
    return { error: "unserializable" };
  }
}

export function sanitizeRequestSummary(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!input) return {};
  const blocked = new Set([
    "iban",
    "name",
    "creditor",
    "debtor",
    "remittance_information",
    "description",
    "privateKey",
    "code",
    "sessionId",
    "session_id",
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (blocked.has(key)) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = sanitizeRequestSummary(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export async function insertEnableBankingApiLog(
  params: InsertApiLogParams,
): Promise<void> {
  try {
    await db.enableBankingApiLog.create({
      data: {
        userId: params.userId,
        connectionId: params.connectionId ?? null,
        action: params.action,
        status: params.status,
        httpStatus: params.httpStatus ?? null,
        requestSummary: clipJson(sanitizeRequestSummary(params.requestSummary)),
        responseSummary: clipJson(params.responseSummary),
        errorMessage: params.errorMessage ?? null,
        durationMs: params.durationMs,
      },
    });
  } catch (error) {
    log.warn("enable_banking.api_log_insert_failed", {
      action: params.action,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function listEnableBankingApiLogs(opts: {
  userId?: string;
  action?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const where = {
    ...(opts.userId ? { userId: opts.userId } : {}),
    ...(opts.action ? { action: opts.action } : {}),
    ...(opts.status ? { status: opts.status } : {}),
  };
  const take = Math.min(opts.limit ?? 50, 200);
  const skip = opts.offset ?? 0;
  const [logs, total] = await Promise.all([
    db.enableBankingApiLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      select: {
        id: true,
        userId: true,
        connectionId: true,
        action: true,
        status: true,
        httpStatus: true,
        requestSummary: true,
        responseSummary: true,
        errorMessage: true,
        durationMs: true,
        createdAt: true,
        user: { select: { email: true } },
      },
    }),
    db.enableBankingApiLog.count({ where }),
  ]);
  return { logs, total };
}

export async function pruneEnableBankingApiLogs(
  olderThanDays = RETENTION_DAYS,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const result = await db.enableBankingApiLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}
