import { createHash } from "node:crypto";

import { getIdpBaseUrl, getIdpBrowserOrigin } from "@/lib/idp-base";

const TFP_PAT_PREFIX = "tfp_pat_";

type CachedOk = { sub: string; tokenId: string; until: number };
const cache = new Map<string, CachedOk>();
const TTL_MS = 45_000;
const MAX_CACHE = 500;

function patIntrospectUrl(): string | null {
  const base = (getIdpBrowserOrigin() || getIdpBaseUrl()).replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/api/v1/pat/introspect`;
}

export function isTfpPatToken(plaintext: string): boolean {
  return plaintext.trim().startsWith(TFP_PAT_PREFIX);
}

/**
 * Validates a `tfp_pat_…` token against trefolio-accounts (server-to-server).
 * Short TTL in-memory cache to avoid hammering the IdP on MCP chatty sessions.
 */
export async function introspectTfpPat(
  plaintext: string,
): Promise<{ sub: string; tokenId: string } | null> {
  const secret = process.env.TREFOLIO_PAT_INTROSPECTION_SECRET?.trim();
  if (!secret) {
    console.warn("[accounts-pat-introspect] TREFOLIO_PAT_INTROSPECTION_SECRET is not set");
    return null;
  }
  const url = patIntrospectUrl();
  if (!url) {
    console.warn("[accounts-pat-introspect] IdP base URL missing; cannot introspect PAT");
    return null;
  }

  const key = createHash("sha256").update(plaintext).digest("hex");
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.until > now) {
    return { sub: hit.sub, tokenId: hit.tokenId };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ token: plaintext }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch (err) {
    console.error("[accounts-pat-introspect] fetch failed", err);
    return null;
  }

  let data: { active?: boolean; sub?: string; token_id?: string };
  try {
    data = (await res.json()) as { active?: boolean; sub?: string; token_id?: string };
  } catch {
    return null;
  }
  if (!data.active || !data.sub) return null;
  const tokenId = String(data.token_id ?? "");

  while (cache.size > MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
    else break;
  }
  cache.set(key, { sub: data.sub, tokenId, until: now + TTL_MS });
  return { sub: data.sub, tokenId };
}
