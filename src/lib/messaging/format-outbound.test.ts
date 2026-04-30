import { describe, expect, it } from "vitest";

import {
  escapeHtmlForTelegram,
  formatAgentMarkdownForTelegramHtml,
  formatAgentMarkdownForWhatsapp,
} from "./format-outbound";

describe("formatAgentMarkdownForWhatsapp", () => {
  it("converts **bold**", () => {
    expect(formatAgentMarkdownForWhatsapp("**Total**: **10**")).toBe("*Total*: *10*");
  });
});

describe("formatAgentMarkdownForTelegramHtml", () => {
  it("escapes HTML then wraps bold segments", () => {
    expect(formatAgentMarkdownForTelegramHtml('**EUR 10** & tickers')).toBe(
      "<b>EUR 10</b> &amp; tickers",
    );
  });

  it("handles angle brackets in plain text", () => {
    expect(formatAgentMarkdownForTelegramHtml("x < y")).toBe("x &lt; y");
  });
});

describe("escapeHtmlForTelegram", () => {
  it("escapes ampersand and brackets", () => {
    expect(escapeHtmlForTelegram("<tag> &")).toBe("&lt;tag&gt; &amp;");
  });
});
