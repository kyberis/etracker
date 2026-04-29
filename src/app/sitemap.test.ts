import { describe, expect, it } from "vitest";

import sitemap from "./sitemap";
import robots from "./robots";

describe("sitemap.ts", () => {
  const entries = sitemap();
  const paths = entries.map((e) => new URL(e.url).pathname || "/");

  it("includes every public marketing route under /es and /en", () => {
    for (const locale of ["es", "en"] as const) {
      for (const expected of [
        `/${locale}`,
        `/${locale}/about`,
        `/${locale}/features`,
        `/${locale}/faq`,
        `/${locale}/changelog`,
        `/${locale}/privacy`,
      ]) {
        expect(paths).toContain(expected);
      }
    }
  });

  it("does not leak any private/app route", () => {
    const FORBIDDEN = ["/app", "/admin", "/settings", "/banks", "/expenses", "/m/"];
    for (const entry of entries) {
      const path = new URL(entry.url).pathname;
      for (const f of FORBIDDEN) {
        expect(path.startsWith(f)).toBe(false);
      }
    }
  });

  it("declares es-AR / en-US / x-default hreflang alternates for each entry", () => {
    for (const entry of entries) {
      expect(entry.alternates?.languages?.["es-AR"]).toBeDefined();
      expect(entry.alternates?.languages?.["en-US"]).toBeDefined();
      expect(entry.alternates?.languages?.["x-default"]).toBeDefined();
    }
  });
});

describe("robots.ts", () => {
  const result = robots();
  const rules = Array.isArray(result.rules) ? result.rules : [result.rules];

  function disallowsFor(userAgent: string): string[] {
    const rule = rules.find((r) =>
      Array.isArray(r.userAgent)
        ? r.userAgent.includes(userAgent)
        : r.userAgent === userAgent,
    );
    if (!rule) return [];
    return Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow ?? ""];
  }

  it("declares an explicit rule for every supported AI crawler", () => {
    for (const ua of [
      "GPTBot",
      "ClaudeBot",
      "PerplexityBot",
      "Google-Extended",
      "Applebot-Extended",
      "OAI-SearchBot",
      "ChatGPT-User",
    ]) {
      expect(disallowsFor(ua).length).toBeGreaterThan(0);
    }
  });

  it("blocks the private app surface for the wildcard rule", () => {
    const wildcardDisallow = disallowsFor("*");
    for (const expected of ["/app", "/admin", "/settings", "/banks", "/expenses"]) {
      expect(wildcardDisallow).toContain(expected);
    }
  });

  it("references the sitemap location", () => {
    expect(result.sitemap).toMatch(/\/sitemap\.xml$/);
  });
});
