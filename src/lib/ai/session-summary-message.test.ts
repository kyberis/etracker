import { describe, expect, it } from "vitest";

import {
  SESSION_SUMMARY_END,
  SESSION_SUMMARY_START,
  buildSessionSummaryUserMessage,
} from "./session-summary-message";

describe("buildSessionSummaryUserMessage", () => {
  it("returns null for empty summary", () => {
    expect(buildSessionSummaryUserMessage(null, "es")).toBeNull();
  });

  it("wraps summary with delimiters", () => {
    const msg = buildSessionSummaryUserMessage("Imported July expenses.", "es");
    expect(msg?.role).toBe("user");
    const content = msg?.content as string;
    expect(content).toContain(SESSION_SUMMARY_START);
    expect(content).toContain(SESSION_SUMMARY_END);
    expect(content).toContain("Imported July expenses.");
  });
});
