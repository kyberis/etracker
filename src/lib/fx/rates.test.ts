import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FxUnavailableError, convertToPrimary, fetchFxRate, normalizeCurrencyCode } from "./rates";

const ORIGINAL_FETCH = global.fetch;

function mockFetchOnce(payload: unknown, init?: { ok?: boolean; status?: number }) {
  const ok = init?.ok ?? true;
  const status = init?.status ?? 200;
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => payload,
  } as Response) as typeof fetch;
}

describe("fx/rates", () => {
  beforeEach(() => {
    delete process.env.FX_FAKE_RATE_USD_EUR;
    delete process.env.FX_FAKE_RATE_USD_ARS;
  });

  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  describe("normalizeCurrencyCode", () => {
    it("upper-cases and trims valid 3-letter codes", () => {
      expect(normalizeCurrencyCode(" usd ")).toBe("USD");
      expect(normalizeCurrencyCode("eur")).toBe("EUR");
    });

    it("returns null for malformed inputs", () => {
      expect(normalizeCurrencyCode("")).toBeNull();
      expect(normalizeCurrencyCode(null)).toBeNull();
      expect(normalizeCurrencyCode("US")).toBeNull();
      expect(normalizeCurrencyCode("USDX")).toBeNull();
      expect(normalizeCurrencyCode("12 ")).toBeNull();
    });
  });

  describe("fetchFxRate", () => {
    it("short-circuits to 1 when from === to", async () => {
      const rate = await fetchFxRate("USD", "USD");
      expect(rate.toString()).toBe("1");
    });

    it("uses FX_FAKE_RATE_<FROM>_<TO> override when set", async () => {
      process.env.FX_FAKE_RATE_USD_EUR = "0.91";
      const rate = await fetchFxRate("usd", "eur");
      expect(rate.toString()).toBe("0.91");
    });

    it("throws FxUnavailableError when upstream returns a non-OK response", async () => {
      mockFetchOnce({}, { ok: false, status: 502 });
      await expect(fetchFxRate("USD", "EUR")).rejects.toBeInstanceOf(FxUnavailableError);
    });

    it("throws FxUnavailableError when payload has no rate", async () => {
      mockFetchOnce({});
      await expect(fetchFxRate("USD", "EUR")).rejects.toBeInstanceOf(FxUnavailableError);
    });
  });

  describe("convertToPrimary", () => {
    it("returns rate=1 and amount unchanged when currencies match", async () => {
      const result = await convertToPrimary({
        amount: 350,
        currency: "usd",
        primary: "USD",
      });
      expect(result.currency).toBe("USD");
      expect(result.fxRate.toString()).toBe("1");
      expect(result.amount.toString()).toBe("350");
      expect(result.amountConverted.toString()).toBe("350");
    });

    it("uses provided fxRate without hitting the network", async () => {
      const fakeFetch = vi.fn();
      global.fetch = fakeFetch as unknown as typeof fetch;
      const result = await convertToPrimary({
        amount: 100,
        currency: "ARS",
        primary: "USD",
        fxRate: "0.001",
      });
      expect(fakeFetch).not.toHaveBeenCalled();
      expect(result.fxRate.toString()).toBe("0.001");
      expect(result.amountConverted.toString()).toBe("0.1");
    });

    it("fetches a live rate and rounds the converted amount to 2 decimals", async () => {
      process.env.FX_FAKE_RATE_USD_EUR = "0.91";
      const result = await convertToPrimary({
        amount: 350,
        currency: "USD",
        primary: "EUR",
      });
      expect(result.fxRate.toString()).toBe("0.91");
      expect(result.amountConverted).toBeInstanceOf(Prisma.Decimal);
      expect(result.amountConverted.toString()).toBe("318.5");
    });
  });
});
