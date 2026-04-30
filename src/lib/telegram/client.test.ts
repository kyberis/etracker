import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { verifyTelegramWebhookRequest } from "./client";

function buildRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://example.com/api/webhooks/telegram", { headers });
}

describe("verifyTelegramWebhookRequest", () => {
  const ORIGINAL = process.env.TELEGRAM_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "super-secret-webhook-token";
  });

  afterEach(() => {
    if (ORIGINAL) process.env.TELEGRAM_WEBHOOK_SECRET = ORIGINAL;
    else delete process.env.TELEGRAM_WEBHOOK_SECRET;
  });

  it("accepts a request with the matching secret header", () => {
    const req = buildRequest({
      "x-telegram-bot-api-secret-token": "super-secret-webhook-token",
    });
    expect(verifyTelegramWebhookRequest(req)).toBe(true);
  });

  it("rejects a request with a mismatched secret", () => {
    const req = buildRequest({
      "x-telegram-bot-api-secret-token": "wrong-token",
    });
    expect(verifyTelegramWebhookRequest(req)).toBe(false);
  });

  it("rejects a request without the header", () => {
    const req = buildRequest();
    expect(verifyTelegramWebhookRequest(req)).toBe(false);
  });

  it("fails closed when the env secret is missing", () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    const req = buildRequest({
      "x-telegram-bot-api-secret-token": "anything",
    });
    expect(verifyTelegramWebhookRequest(req)).toBe(false);
  });
});
