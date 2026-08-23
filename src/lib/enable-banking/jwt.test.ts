import { generateKeyPairSync } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createEnableBankingJwt,
  decodeJwtHeader,
  decodeJwtPayload,
  resetEnableBankingJwtCache,
} from "./jwt";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

beforeEach(() => {
  resetEnableBankingJwtCache();
  process.env.ENABLE_BANKING_APP_ID = "app-test-id";
  process.env.ENABLE_BANKING_PRIVATE_KEY = pem;
});

afterEach(() => {
  resetEnableBankingJwtCache();
  delete process.env.ENABLE_BANKING_APP_ID;
  delete process.env.ENABLE_BANKING_PRIVATE_KEY;
});

describe("createEnableBankingJwt", () => {
  it("signs RS256 with kid = app id and fixed iss/aud", async () => {
    const now = 1_700_000_000;
    const token = await createEnableBankingJwt(now);
    const header = decodeJwtHeader(token);
    const payload = decodeJwtPayload(token);
    expect(header.alg).toBe("RS256");
    expect(header.kid).toBe("app-test-id");
    expect(payload.iss).toBe("enablebanking.com");
    expect(payload.aud).toBe("api.enablebanking.com");
    expect(payload.iat).toBe(now);
    expect(payload.exp).toBe(now + 3600);
  });

  it("reuses the cached token inside the TTL", async () => {
    const first = await createEnableBankingJwt(1_700_000_000);
    const second = await createEnableBankingJwt(1_700_000_100);
    expect(second).toBe(first);
  });
});
