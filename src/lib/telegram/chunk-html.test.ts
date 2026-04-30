import { describe, expect, it } from "vitest";

import {
  chunkPlainTelegramHtml,
  chunkTelegramHtmlForSend,
  parseTelegramHtmlSegments,
  stripTelegramBoldTags,
  TELEGRAM_MESSAGE_MAX,
} from "./chunk-html";

function balancedBold(html: string): boolean {
  let depth = 0;
  for (let i = 0; i < html.length; ) {
    if (html.startsWith("<b>", i)) {
      depth++;
      i += 3;
      continue;
    }
    if (html.startsWith("</b>", i)) {
      depth--;
      if (depth < 0) return false;
      i += 4;
      continue;
    }
    i++;
  }
  return depth === 0;
}

describe("stripTelegramBoldTags", () => {
  it("removes b tags", () => {
    expect(stripTelegramBoldTags("a<b>x</b>y")).toBe("axy");
  });
});

describe("parseTelegramHtmlSegments", () => {
  it("alternates plain and bold", () => {
    expect(parseTelegramHtmlSegments('hi<b>there</b>!')).toEqual([
      "hi",
      "<b>there</b>",
      "!",
    ]);
  });
});

describe("chunkTelegramHtmlForSend", () => {
  it("returns a single chunk when under the limit", () => {
    expect(chunkTelegramHtmlForSend("hello<b>w</b>")).toEqual(["hello<b>w</b>"]);
  });

  it("keeps every chunk within Telegram max length", () => {
    const html = `${"p".repeat(5000)}<b>${"z".repeat(100)}</b>${"q".repeat(5000)}`;
    const chunks = chunkTelegramHtmlForSend(html);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_MAX);
      expect(balancedBold(c)).toBe(true);
    }
  });

  it("does not split inside a bold block", () => {
    const inner = `line\n${"x".repeat(TELEGRAM_MESSAGE_MAX)}`;
    const html = `start<b>${inner}</b>end`;
    const chunks = chunkTelegramHtmlForSend(html);
    for (const c of chunks) {
      expect(balancedBold(c)).toBe(true);
    }
  });
});

describe("chunkPlainTelegramHtml", () => {
  it("respects max length", () => {
    const s = "a".repeat(100);
    const parts = chunkPlainTelegramHtml(s, 30);
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(30);
    }
    expect(parts.join("")).toBe(s);
  });
});
