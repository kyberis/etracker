import { describe, expect, it } from "vitest";

import { resolveMonthLineKind } from "./month-line-kind";

describe("resolveMonthLineKind", () => {
  it("marks template + isRecurring as RECURRING", () => {
    expect(
      resolveMonthLineKind({ templateId: "t1", templateIsRecurring: true }),
    ).toBe("RECURRING");
  });

  it("marks template + not recurring as ONE_OFF", () => {
    expect(
      resolveMonthLineKind({ templateId: "t1", templateIsRecurring: false }),
    ).toBe("ONE_OFF");
  });

  it("marks null template as ONE_OFF", () => {
    expect(resolveMonthLineKind({ templateId: null })).toBe("ONE_OFF");
    expect(
      resolveMonthLineKind({ templateId: null, templateIsRecurring: true }),
    ).toBe("ONE_OFF");
  });

  it("marks missing isRecurring on template as ONE_OFF", () => {
    expect(resolveMonthLineKind({ templateId: "t1" })).toBe("ONE_OFF");
    expect(
      resolveMonthLineKind({ templateId: "t1", templateIsRecurring: null }),
    ).toBe("ONE_OFF");
  });
});
