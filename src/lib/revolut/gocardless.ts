const GOCARDLESS_BASE = "https://bankaccountdata.gocardless.com/api/v2";

type TokenState = {
  refresh: string;
  refreshExpiresAt: number;
  access: string;
  accessExpiresAt: number;
};

const tokenStateKey = "__etrackerGocardlessToken" as const;

function getTokenState(): TokenState | undefined {
  const g = globalThis as typeof globalThis & { [tokenStateKey]?: TokenState };
  return g[tokenStateKey];
}

function setTokenState(state: TokenState) {
  const g = globalThis as typeof globalThis & { [tokenStateKey]?: TokenState };
  g[tokenStateKey] = state;
}

function getSecrets() {
  const secretId = process.env.GOCARDLESS_SECRET_ID;
  const secretKey = process.env.GOCARDLESS_SECRET_KEY;
  if (!secretId?.length || !secretKey?.length) {
    throw new Error("GOCARDLESS_MISSING_SECRETS");
  }
  return { secretId, secretKey };
}

async function postJson<T>(path: string, body: unknown, auth?: string): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "Content-Type": "application/json",
  };
  if (auth) {
    headers.Authorization = `Bearer ${auth}`;
  }
  const res = await fetch(`${GOCARDLESS_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GOCARDLESS_HTTP_${res.status}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

async function getJson<T>(path: string, auth: string): Promise<T> {
  const res = await fetch(`${GOCARDLESS_BASE}${path}`, {
    method: "GET",
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${auth}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GOCARDLESS_HTTP_${res.status}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

type TokenNewResponse = {
  refresh: string;
  refresh_expires?: number;
  access?: string;
  access_expires?: number;
};

/** Exchange secrets for refresh token (and sometimes access). */
async function fetchNewRefreshToken(): Promise<{
  refresh: string;
  refreshExpiresSec?: number;
  access?: string;
  accessExpiresSec?: number;
}> {
  const { secretId, secretKey } = getSecrets();
  const raw = await postJson<TokenNewResponse>("/token/new/", {
    secret_id: secretId,
    secret_key: secretKey,
  });
  return {
    refresh: raw.refresh,
    refreshExpiresSec: raw.refresh_expires,
    access: raw.access,
    accessExpiresSec: raw.access_expires,
  };
}

type TokenRefreshResponse = {
  access: string;
  access_expires: number;
};

async function fetchAccessFromRefresh(refresh: string): Promise<TokenRefreshResponse> {
  return postJson<TokenRefreshResponse>("/token/refresh/", { refresh });
}

/**
 * Returns a valid GoCardless Bank Account Data access token.
 * Caches refresh + access in memory (best-effort for serverless).
 */
export async function getGocardlessAccessToken(): Promise<string> {
  const now = Date.now();
  const existing = getTokenState();
  if (existing && existing.accessExpiresAt > now + 60_000) {
    return existing.access;
  }
  if (existing && existing.refreshExpiresAt > now + 60_000) {
    const refreshed = await fetchAccessFromRefresh(existing.refresh);
    const next: TokenState = {
      ...existing,
      access: refreshed.access,
      accessExpiresAt: now + refreshed.access_expires * 1000,
    };
    setTokenState(next);
    return next.access;
  }

  const created = await fetchNewRefreshToken();
  const refreshExpiresMs = (created.refreshExpiresSec ?? 2_592_000) * 1000;
  if (created.access && created.accessExpiresSec) {
    const next: TokenState = {
      refresh: created.refresh,
      refreshExpiresAt: now + refreshExpiresMs,
      access: created.access,
      accessExpiresAt: now + created.accessExpiresSec * 1000,
    };
    setTokenState(next);
    return next.access;
  }

  const refreshed = await fetchAccessFromRefresh(created.refresh);
  const next: TokenState = {
    refresh: created.refresh,
    refreshExpiresAt: now + refreshExpiresMs,
    access: refreshed.access,
    accessExpiresAt: now + refreshed.access_expires * 1000,
  };
  setTokenState(next);
  return next.access;
}

export type GocardlessInstitution = {
  id: string;
  name: string;
  bic?: string;
  countries?: string[];
};

export async function listInstitutions(country: string): Promise<GocardlessInstitution[]> {
  const token = await getGocardlessAccessToken();
  const cc = country.trim().toLowerCase();
  return getJson<GocardlessInstitution[]>(`/institutions/?country=${encodeURIComponent(cc)}`, token);
}

export type GocardlessRequisition = {
  id: string;
  status: string;
  institution_id: string;
  accounts: string[];
  link: string;
  redirect: string;
  reference?: string;
};

export async function createRequisition(params: {
  institutionId: string;
  redirect: string;
  reference: string;
  userLanguage?: string;
}): Promise<GocardlessRequisition> {
  const token = await getGocardlessAccessToken();
  return postJson(
    "/requisitions/",
    {
      institution_id: params.institutionId,
      redirect: params.redirect,
      reference: params.reference,
      user_language: params.userLanguage ?? "EN",
    },
    token,
  );
}

export async function getRequisition(requisitionId: string): Promise<GocardlessRequisition> {
  const token = await getGocardlessAccessToken();
  return getJson<GocardlessRequisition>(`/requisitions/${requisitionId}/`, token);
}

export type GocardlessBookedTransaction = {
  transactionId?: string;
  internalTransactionId?: string;
  bookingDate?: string;
  valueDate?: string;
  remittanceInformationUnstructured?: string;
  creditorName?: string;
  debtorName?: string;
  transactionAmount: { amount: string; currency?: string };
};

export type GocardlessTransactionsResponse = {
  transactions: {
    booked: GocardlessBookedTransaction[];
    pending: GocardlessBookedTransaction[];
  };
};

export async function getAccountTransactions(
  accountId: string,
  params?: { dateFrom?: string; dateTo?: string },
): Promise<GocardlessTransactionsResponse> {
  const token = await getGocardlessAccessToken();
  const search = new URLSearchParams();
  if (params?.dateFrom) search.set("date_from", params.dateFrom);
  if (params?.dateTo) search.set("date_to", params.dateTo);
  const qs = search.toString();
  const path = `/accounts/${accountId}/transactions/${qs ? `?${qs}` : ""}`;
  return getJson<GocardlessTransactionsResponse>(path, token);
}

export function resolveTransactionId(tx: GocardlessBookedTransaction): string | null {
  if (tx.transactionId?.length) return tx.transactionId;
  if (tx.internalTransactionId?.length) return tx.internalTransactionId;
  return null;
}
