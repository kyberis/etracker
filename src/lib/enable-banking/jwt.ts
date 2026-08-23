import { createPrivateKey } from "node:crypto";

import { SignJWT } from "jose";

import {
  getEnableBankingAppId,
  getEnableBankingPrivateKey,
} from "./config";

const JWT_TTL_SECONDS = 3600;
const CACHE_SKEW_SECONDS = 300;

type CachedJwt = { token: string; exp: number };

let cached: CachedJwt | null = null;

export function resetEnableBankingJwtCache(): void {
  cached = null;
}

function loadPrivateKey() {
  const pem = getEnableBankingPrivateKey();
  if (!pem) {
    throw new Error("ENABLE_BANKING_NOT_CONFIGURED");
  }
  return createPrivateKey(pem);
}

/**
 * RS256 JWT expected by Enable Banking: iss/aud fixed, kid = Application ID.
 * Cached for ~55 minutes so we don't sign on every request.
 */
export async function createEnableBankingJwt(
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  if (cached && cached.exp - CACHE_SKEW_SECONDS > nowSeconds) {
    return cached.token;
  }

  const appId = getEnableBankingAppId();
  if (!appId) {
    throw new Error("ENABLE_BANKING_NOT_CONFIGURED");
  }

  const exp = nowSeconds + JWT_TTL_SECONDS;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: appId })
    .setIssuer("enablebanking.com")
    .setAudience("api.enablebanking.com")
    .setIssuedAt(nowSeconds)
    .setExpirationTime(exp)
    .sign(loadPrivateKey());

  cached = { token, exp };
  return token;
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT");
  }
  const json = Buffer.from(parts[1], "base64url").toString("utf8");
  return JSON.parse(json) as Record<string, unknown>;
}

export function decodeJwtHeader(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT");
  }
  const json = Buffer.from(parts[0], "base64url").toString("utf8");
  return JSON.parse(json) as Record<string, unknown>;
}
