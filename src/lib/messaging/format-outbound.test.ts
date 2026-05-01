import { describe, expect, it } from "vitest";

import {
  escapeHtmlForTelegram,
  formatAgentMarkdownForTelegramHtml,
} from "./format-outbound";

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
