import { describe, expect, it } from "vitest";

import { sanitizeRequestSummary } from "@/lib/db/enable-banking-logs";

describe("sanitizeRequestSummary", () => {
  it("strips IBANs, names and session secrets", () => {
    const clean = sanitizeRequestSummary({
      accountUid: "acc_1",
      iban: "FI7473834510057469",
      name: "Cafe",
      nested: { session_id: "secret", country: "FI" },
    });
    expect(clean).toEqual({
      accountUid: "acc_1",
      nested: { country: "FI" },
    });
  });
});
