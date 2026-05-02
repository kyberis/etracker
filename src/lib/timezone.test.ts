import { describe, expect, it } from "vitest";

import {
  DEFAULT_TIMEZONE,
  countryToTimezone,
  currentHourInTimezone,
  localDayBoundsInUtc,
  resolveLocaleForOutbound,
} from "./timezone";

describe("countryToTimezone", () => {
  it("returns the mapped IANA zone for rioplatense countries", () => {
    expect(countryToTimezone("AR")).toBe("America/Argentina/Buenos_Aires");
    expect(countryToTimezone("UY")).toBe("America/Montevideo");
  });

  it("returns the mapped IANA zone for Spain", () => {
    expect(countryToTimezone("ES")).toBe("Europe/Madrid");
  });

  it("is case insensitive and trims whitespace", () => {
    expect(countryToTimezone("ar")).toBe("America/Argentina/Buenos_Aires");
    expect(countryToTimezone(" es ")).toBe("Europe/Madrid");
  });

  it("falls back to UTC for unknown / null / invalid input", () => {
    expect(countryToTimezone(null)).toBe(DEFAULT_TIMEZONE);
    expect(countryToTimezone(undefined)).toBe(DEFAULT_TIMEZONE);
    expect(countryToTimezone("")).toBe(DEFAULT_TIMEZONE);
    expect(countryToTimezone("ZZ")).toBe(DEFAULT_TIMEZONE);
    expect(countryToTimezone("ABC")).toBe(DEFAULT_TIMEZONE);
  });
});

describe("currentHourInTimezone", () => {
  it("returns the local hour for Buenos Aires (UTC-3, no DST)", () => {
    // 2026-05-02T23:00:00Z → 20:00 en America/Argentina/Buenos_Aires
    const nowUtc = new Date(Date.UTC(2026, 4, 2, 23, 0, 0));
    expect(
      currentHourInTimezone("America/Argentina/Buenos_Aires", nowUtc),
    ).toBe(20);
  });

  it("returns the local hour for Madrid in summer (DST, UTC+2)", () => {
    // 2026-07-15T18:00:00Z → 20:00 en Europe/Madrid (CEST)
    const nowUtc = new Date(Date.UTC(2026, 6, 15, 18, 0, 0));
    expect(currentHourInTimezone("Europe/Madrid", nowUtc)).toBe(20);
  });

  it("returns the local hour for Madrid in winter (no DST, UTC+1)", () => {
    // 2026-12-15T19:00:00Z → 20:00 en Europe/Madrid (CET)
    const nowUtc = new Date(Date.UTC(2026, 11, 15, 19, 0, 0));
    expect(currentHourInTimezone("Europe/Madrid", nowUtc)).toBe(20);
  });

  it("returns the input hour for UTC", () => {
    const nowUtc = new Date(Date.UTC(2026, 4, 2, 14, 0, 0));
    expect(currentHourInTimezone("UTC", nowUtc)).toBe(14);
  });
});

describe("localDayBoundsInUtc", () => {
  it("computes bounds spanning a full local day for Buenos Aires", () => {
    // Reference: 2026-05-02T23:00:00Z → 20:00 local 2026-05-02.
    const nowUtc = new Date(Date.UTC(2026, 4, 2, 23, 0, 0));
    const { startUtc, endUtc } = localDayBoundsInUtc(
      "America/Argentina/Buenos_Aires",
      nowUtc,
    );
    // 00:00 local 2026-05-02 == 03:00 UTC 2026-05-02
    expect(startUtc.toISOString()).toBe("2026-05-02T03:00:00.000Z");
    // 00:00 local 2026-05-03 == 03:00 UTC 2026-05-03
    expect(endUtc.toISOString()).toBe("2026-05-03T03:00:00.000Z");
    expect(endUtc.getTime() - startUtc.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("computes bounds for Madrid in summer (DST, UTC+2)", () => {
    const nowUtc = new Date(Date.UTC(2026, 6, 15, 18, 0, 0));
    const { startUtc, endUtc } = localDayBoundsInUtc("Europe/Madrid", nowUtc);
    expect(startUtc.toISOString()).toBe("2026-07-14T22:00:00.000Z");
    expect(endUtc.toISOString()).toBe("2026-07-15T22:00:00.000Z");
  });

  it("computes bounds for UTC identical to calendar day", () => {
    const nowUtc = new Date(Date.UTC(2026, 4, 2, 23, 59, 0));
    const { startUtc, endUtc } = localDayBoundsInUtc("UTC", nowUtc);
    expect(startUtc.toISOString()).toBe("2026-05-02T00:00:00.000Z");
    expect(endUtc.toISOString()).toBe("2026-05-03T00:00:00.000Z");
  });

  it("honours spring-forward (Europe/Madrid) — window stays 23h but endUtc is the correct next local midnight", () => {
    // Spring-forward in 2026 CET→CEST: Sunday 2026-03-29 at 02:00 local
    // jumps to 03:00. "Today" at noon local on 2026-03-29:
    const nowUtc = new Date(Date.UTC(2026, 2, 29, 10, 0, 0)); // 10:00 UTC
    const { startUtc, endUtc } = localDayBoundsInUtc("Europe/Madrid", nowUtc);
    // 00:00 local 2026-03-29 in CET = 23:00 UTC 2026-03-28
    expect(startUtc.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    // 00:00 local 2026-03-30 in CEST = 22:00 UTC 2026-03-29
    expect(endUtc.toISOString()).toBe("2026-03-29T22:00:00.000Z");
    // 23 real hours on this calendar day.
    expect(endUtc.getTime() - startUtc.getTime()).toBe(23 * 60 * 60 * 1000);
  });
});

describe("resolveLocaleForOutbound", () => {
  it("accepts supported locales", () => {
    expect(resolveLocaleForOutbound("es")).toBe("es");
    expect(resolveLocaleForOutbound("en")).toBe("en");
  });

  it("falls back to es for unknown / missing values", () => {
    expect(resolveLocaleForOutbound(null)).toBe("es");
    expect(resolveLocaleForOutbound(undefined)).toBe("es");
    expect(resolveLocaleForOutbound("fr")).toBe("es");
    expect(resolveLocaleForOutbound("")).toBe("es");
  });
});
