import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { candidateWebhookUrls } from "./twilio";

function buildRequest(
  url: string,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, { headers });
}

describe("candidateWebhookUrls", () => {
  const originalEnv = process.env.TWILIO_WEBHOOK_PUBLIC_URL;

  beforeEach(() => {
    delete process.env.TWILIO_WEBHOOK_PUBLIC_URL;
    delete process.env.TWILIO_STATUS_CALLBACK_PUBLIC_URL;
  });

  afterEach(() => {
    if (originalEnv) process.env.TWILIO_WEBHOOK_PUBLIC_URL = originalEnv;
    else delete process.env.TWILIO_WEBHOOK_PUBLIC_URL;
  });

  it("includes the explicit env URL first when set", () => {
    process.env.TWILIO_WEBHOOK_PUBLIC_URL =
      "https://etracker.example.com/api/webhooks/whatsapp";
    const req = buildRequest(
      "https://etracker.example.com/api/webhooks/whatsapp",
    );
    const urls = candidateWebhookUrls(req);
    expect(urls[0]).toBe(
      "https://etracker.example.com/api/webhooks/whatsapp",
    );
  });

  it("uses the status env URL only for role=status", () => {
    process.env.TWILIO_WEBHOOK_PUBLIC_URL = "https://a.example/api/webhooks/whatsapp";
    process.env.TWILIO_STATUS_CALLBACK_PUBLIC_URL =
      "https://b.example/api/webhooks/whatsapp/status";
    const req = buildRequest(
      "https://a.example/api/webhooks/whatsapp/status",
    );
    expect(candidateWebhookUrls(req, "status")[0]).toBe(
      "https://b.example/api/webhooks/whatsapp/status",
    );
    expect(candidateWebhookUrls(req, "inbound")[0]).toBe(
      "https://a.example/api/webhooks/whatsapp",
    );
  });

  it("derives candidates from x-forwarded-* headers behind a proxy", () => {
    const req = buildRequest("http://internal-host/api/webhooks/whatsapp", {
      "x-forwarded-proto": "https",
      "x-forwarded-host": "etracker.public.com",
      host: "internal-host",
    });
    const urls = candidateWebhookUrls(req);
    expect(urls).toContain(
      "https://etracker.public.com/api/webhooks/whatsapp",
    );
  });

  it("strips :443 / :80 and adds trailing-slash variants", () => {
    const req = buildRequest("https://etracker.example.com:443/api/webhooks/whatsapp", {
      host: "etracker.example.com:443",
    });
    const urls = candidateWebhookUrls(req);
    expect(urls).toContain(
      "https://etracker.example.com/api/webhooks/whatsapp",
    );
    expect(urls).toContain(
      "https://etracker.example.com/api/webhooks/whatsapp/",
    );
  });

  it("handles comma-separated x-forwarded-host", () => {
    const req = buildRequest("https://b.com/api/webhooks/whatsapp", {
      "x-forwarded-host": "a.com, b.com",
    });
    const urls = candidateWebhookUrls(req);
    expect(urls).toContain("https://a.com/api/webhooks/whatsapp");
    expect(urls).toContain("https://b.com/api/webhooks/whatsapp");
  });
});
