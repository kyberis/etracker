import { insertEnableBankingApiLog } from "@/lib/db/enable-banking-logs";
import { log } from "@/lib/log";

import {
  getEnableBankingApiBase,
  getEnableBankingRedirectUrl,
} from "./config";
import { createEnableBankingJwt } from "./jwt";
import {
  aspspListSchema,
  balanceListSchema,
  enableBankingErrorSchema,
  sessionSchema,
  startAuthResponseSchema,
  transactionListSchema,
  type Aspsp,
  type EnableBankingSession,
  type EnableBankingTransaction,
} from "./schemas";

export class EnableBankingApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "EnableBankingApiError";
  }
}

export type PsuContext = {
  ip?: string;
  userAgent?: string;
};

type RequestOpts = {
  userId: string;
  connectionId?: string | null;
  action: string;
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
  requestSummary?: Record<string, unknown>;
  psu?: PsuContext;
};

async function enableBankingRequest<T>(
  opts: RequestOpts,
  parse: (json: unknown) => T,
  summarize?: (data: T) => Record<string, unknown>,
): Promise<T> {
  const started = Date.now();
  const token = await createEnableBankingJwt();
  const url = new URL(`${getEnableBankingApiBase()}${opts.path}`);
  if (opts.query) {
    for (const [key, value] of Object.entries(opts.query)) {
      if (value) url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (opts.psu?.ip) headers["PSU-IP-Address"] = opts.psu.ip;
  if (opts.psu?.userAgent) headers["PSU-User-Agent"] = opts.psu.userAgent;

  let httpStatus = 0;
  let errorCode: string | undefined;
  let errorMessage: string | undefined;
  try {
    const response = await fetch(url, {
      method: opts.method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(30_000),
    });
    httpStatus = response.status;
    const json: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const parsed = enableBankingErrorSchema.safeParse(json);
      errorCode =
        parsed.success
          ? (parsed.data.error ?? parsed.data.code ?? `HTTP_${response.status}`)
          : `HTTP_${response.status}`;
      errorMessage =
        parsed.success
          ? (parsed.data.message ?? parsed.data.error ?? response.statusText)
          : response.statusText;
      throw new EnableBankingApiError(
        errorCode,
        response.status,
        errorMessage ?? "Enable Banking request failed.",
      );
    }
    const data = parse(json);
    const durationMs = Date.now() - started;
    log.info("enable_banking.api", {
      action: opts.action,
      status: "success",
      durationMs,
      userId: opts.userId,
      httpStatus,
    });
    void insertEnableBankingApiLog({
      userId: opts.userId,
      connectionId: opts.connectionId,
      action: opts.action,
      status: "success",
      httpStatus,
      requestSummary: opts.requestSummary,
      responseSummary: summarize?.(data) ?? { ok: true },
      durationMs,
    });
    return data;
  } catch (error) {
    const durationMs = Date.now() - started;
    const code =
      error instanceof EnableBankingApiError
        ? error.code
        : "NETWORK_ERROR";
    const message = error instanceof Error ? error.message : String(error);
    log.warn("enable_banking.api", {
      action: opts.action,
      status: "error",
      durationMs,
      userId: opts.userId,
      httpStatus: httpStatus || undefined,
      error: code,
    });
    void insertEnableBankingApiLog({
      userId: opts.userId,
      connectionId: opts.connectionId,
      action: opts.action,
      status: "error",
      httpStatus: httpStatus || null,
      requestSummary: opts.requestSummary,
      responseSummary: { error: code },
      errorMessage: message,
      durationMs,
    });
    throw error;
  }
}

export async function listAspsps(input: {
  userId: string;
  country: string;
}): Promise<Aspsp[]> {
  const data = await enableBankingRequest(
    {
      userId: input.userId,
      action: "listAspsps",
      method: "GET",
      path: "/aspsps",
      query: {
        country: input.country.toUpperCase(),
        psu_type: "personal",
        service: "AIS",
      },
      requestSummary: { country: input.country.toUpperCase() },
    },
    (json) => aspspListSchema.parse(json),
    (parsed) => ({ count: parsed.aspsps.length }),
  );
  return data.aspsps;
}

export async function startAuth(input: {
  userId: string;
  institutionName: string;
  institutionCountry: string;
  state: string;
  validUntil: Date;
}): Promise<{ url: string }> {
  const redirectUrl = getEnableBankingRedirectUrl();
  const data = await enableBankingRequest(
    {
      userId: input.userId,
      action: "startAuth",
      method: "POST",
      path: "/auth",
      body: {
        access: { valid_until: input.validUntil.toISOString() },
        aspsp: {
          name: input.institutionName,
          country: input.institutionCountry.toUpperCase(),
        },
        state: input.state,
        redirect_url: redirectUrl,
        psu_type: "personal",
      },
      requestSummary: {
        institutionName: input.institutionName,
        country: input.institutionCountry.toUpperCase(),
      },
    },
    (json) => startAuthResponseSchema.parse(json),
    () => ({ started: true }),
  );
  return { url: data.url };
}

export async function createSession(input: {
  userId: string;
  code: string;
}): Promise<EnableBankingSession> {
  return enableBankingRequest(
    {
      userId: input.userId,
      action: "createSession",
      method: "POST",
      path: "/sessions",
      body: { code: input.code },
      requestSummary: { hasCode: true },
    },
    (json) => sessionSchema.parse(json),
    (parsed) => ({
      accountCount: parsed.accounts.length,
      hasValidUntil: Boolean(parsed.access?.valid_until),
    }),
  );
}

export async function getSession(input: {
  userId: string;
  connectionId?: string;
  sessionId: string;
}): Promise<EnableBankingSession> {
  return enableBankingRequest(
    {
      userId: input.userId,
      connectionId: input.connectionId,
      action: "getSession",
      method: "GET",
      path: `/sessions/${encodeURIComponent(input.sessionId)}`,
      requestSummary: { hasSession: true },
    },
    (json) => sessionSchema.parse(json),
    (parsed) => ({ accountCount: parsed.accounts.length }),
  );
}

export async function listBalances(input: {
  userId: string;
  connectionId?: string;
  accountUid: string;
  psu?: PsuContext;
}): Promise<{ count: number }> {
  const data = await enableBankingRequest(
    {
      userId: input.userId,
      connectionId: input.connectionId,
      action: "listBalances",
      method: "GET",
      path: `/accounts/${encodeURIComponent(input.accountUid)}/balances`,
      requestSummary: { accountUid: input.accountUid },
      psu: input.psu,
    },
    (json) => balanceListSchema.parse(json),
    (parsed) => ({ count: parsed.balances.length }),
  );
  return { count: data.balances.length };
}

export async function listTransactions(input: {
  userId: string;
  connectionId?: string;
  accountUid: string;
  dateFrom?: string;
  continuationKey?: string;
  psu?: PsuContext;
}): Promise<{
  transactions: EnableBankingTransaction[];
  continuationKey: string | null;
}> {
  const data = await enableBankingRequest(
    {
      userId: input.userId,
      connectionId: input.connectionId,
      action: "listTransactions",
      method: "GET",
      path: `/accounts/${encodeURIComponent(input.accountUid)}/transactions`,
      query: {
        date_from: input.dateFrom,
        continuation_key: input.continuationKey,
      },
      requestSummary: {
        accountUid: input.accountUid,
        dateFrom: input.dateFrom,
        hasContinuation: Boolean(input.continuationKey),
      },
      psu: input.psu,
    },
    (json) => transactionListSchema.parse(json),
    (parsed) => ({
      count: parsed.transactions.length,
      hasContinuation: Boolean(parsed.continuation_key),
    }),
  );
  return {
    transactions: data.transactions,
    continuationKey: data.continuation_key ?? null,
  };
}
