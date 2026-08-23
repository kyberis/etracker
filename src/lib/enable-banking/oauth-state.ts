import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type OAuthStatePayload = {
  userId: string;
  institutionName: string;
  institutionCountry: string;
  nonce: string;
  exp: number;
};

const STATE_TTL_SECONDS = 15 * 60;

function signingSecret(): string {
  const key =
    process.env.BANK_SYNC_ENCRYPTION_KEY?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim();
  if (!key) {
    throw new Error("ENABLE_BANKING_NOT_CONFIGURED");
  }
  return key;
}

function sign(body: string): string {
  return createHmac("sha256", signingSecret()).update(body).digest("base64url");
}

export function createOAuthState(input: {
  userId: string;
  institutionName: string;
  institutionCountry: string;
  now?: Date;
}): string {
  const payload: OAuthStatePayload = {
    userId: input.userId,
    institutionName: input.institutionName,
    institutionCountry: input.institutionCountry.toUpperCase(),
    nonce: randomBytes(16).toString("hex"),
    exp: Math.floor((input.now ?? new Date()).getTime() / 1000) + STATE_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyOAuthState(
  raw: string,
  now = new Date(),
): OAuthStatePayload {
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) {
    throw new Error("INVALID_OAUTH_STATE");
  }
  const body = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  const expected = sign(body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("INVALID_OAUTH_STATE");
  }
  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthStatePayload;
  } catch {
    throw new Error("INVALID_OAUTH_STATE");
  }
  if (
    !payload.userId ||
    !payload.institutionName ||
    !payload.institutionCountry ||
    !payload.nonce ||
    typeof payload.exp !== "number"
  ) {
    throw new Error("INVALID_OAUTH_STATE");
  }
  if (payload.exp < Math.floor(now.getTime() / 1000)) {
    throw new Error("EXPIRED_OAUTH_STATE");
  }
  return payload;
}
