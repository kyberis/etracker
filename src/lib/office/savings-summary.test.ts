import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { buildClaraOfficeSavingsSummary } from "./savings-summary";
import type { ResolvedOfficeUser } from "./resolve-office-user";

function user(partial: Partial<ResolvedOfficeUser>): ResolvedOfficeUser {
  return {
    id: "u1",
    email: "a@example.com",
    idpSub: "sub-1",
    savings: new Prisma.Decimal(0),
    monthlyIncome: new Prisma.Decimal(0),
    primaryCurrency: "EUR",
    isActive: true,
    kind: "REGULAR",
    ...partial,
  };
}

describe("buildClaraOfficeSavingsSummary", () => {
  it("uses 3x monthly income as emergency target", () => {
    const summary = buildClaraOfficeSavingsSummary(
      user({
        savings: new Prisma.Decimal(15000),
        monthlyIncome: new Prisma.Decimal(3000),
      }),
    );
    expect(summary.emergencyTargetEur).toBe(9000);
    expect(summary.surplusEur).toBe(6000);
    expect(summary.freeInInvestingBucketEur).toBe(6000);
  });

  it("adds a currency note when primary currency is not EUR", () => {
    const summary = buildClaraOfficeSavingsSummary(
      user({
        savings: new Prisma.Decimal(5000),
        monthlyIncome: new Prisma.Decimal(2000),
        primaryCurrency: "USD",
      }),
    );
    expect(summary.note).toContain("USD");
  });
});
