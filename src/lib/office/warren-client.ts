/**
 * Server-side call to trefolio's internal Warren chat (Clara → Warren).
 * Mirrors trefolio's `clara-client.ts`, inverted.
 */

export type WarrenConsultReason =
  | "no_idp"
  | "no_trefolio_account"
  | "not_configured"
  | "unreachable";

export type WarrenConsultResult =
  | { available: true; text: string; note?: string }
  | {
      available: false;
      reason: WarrenConsultReason;
      signupUrl: string;
      note?: string;
    };

const TIMEOUT_MS = 90_000;
const PROD_TREFOLIO_PUBLIC_URL = "https://trefolio.com";

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("http://")) {
    return trimmed.replace(/^http:\/\//, "https://");
  }
  return trimmed;
}

/** Public origin for signup links shown to the user. */
export function getTrefolioPublicUrl(): string {
  const raw = process.env.TREFOLIO_PUBLIC_URL?.trim();
  const base = raw && raw.length > 0 ? raw : PROD_TREFOLIO_PUBLIC_URL;
  return normalizeBaseUrl(base);
}

export function getTrefolioSignupUrl(): string {
  return `${getTrefolioPublicUrl()}/signup`;
}

function getTrefolioBaseUrl(): string | null {
  const raw = process.env.TREFOLIO_BASE_URL?.trim();
  if (raw) return normalizeBaseUrl(raw);
  if (process.env.NODE_ENV === "production") {
    return PROD_TREFOLIO_PUBLIC_URL;
  }
  return null;
}

function getIdpServiceToken(): string | null {
  return process.env.IDP_SERVICE_TOKEN?.trim() || null;
}

export interface FetchWarrenReplyInput {
  idpSub?: string | null;
  email?: string | null;
  message: string;
  language?: string;
}

/**
 * Ask Warren (trefolio) for a portfolio reply. Does not consume Clara quota —
 * callers must already have passed `consumeAgentQuota`.
 */
export async function fetchWarrenReply(
  input: FetchWarrenReplyInput,
): Promise<WarrenConsultResult> {
  const signupUrl = getTrefolioSignupUrl();
  const base = getTrefolioBaseUrl();
  const token = getIdpServiceToken();

  if (!base || !token) {
    if (process.env.NODE_ENV === "development") {
      return {
        available: true,
        text: "Dev stub (trefolio not configured): no live portfolio.",
        note: "Dev stub",
      };
    }
    return {
      available: false,
      reason: "not_configured",
      signupUrl,
      note: "Trefolio is not configured on this Clara instance.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${base}/api/internal/office/warren-chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        billingSource: "clara",
        sub: input.idpSub?.trim() || "",
        email: input.email?.trim() || "",
        message: input.message,
        language: input.language,
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (res.status === 404) {
      const data = (await res.json().catch(() => ({}))) as {
        signupUrl?: string;
        note?: string;
      };
      return {
        available: false,
        reason: "no_trefolio_account",
        signupUrl: data.signupUrl || signupUrl,
        note: data.note,
      };
    }

    if (!res.ok) {
      return {
        available: false,
        reason: "unreachable",
        signupUrl,
        note: `Trefolio HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as { available?: boolean; text?: string; note?: string };
    if (data.available && data.text?.trim()) {
      return { available: true, text: data.text.trim(), note: data.note };
    }
    return {
      available: false,
      reason: "unreachable",
      signupUrl,
      note: data.note || "Warren returned an empty reply.",
    };
  } catch {
    return {
      available: false,
      reason: "unreachable",
      signupUrl,
      note: "Warren unreachable",
    };
  } finally {
    clearTimeout(timer);
  }
}
