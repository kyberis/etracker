import { describe, expect, it } from "vitest";

import {
  recurringCandidateSchema,
  recurringCandidatesSpecSchema,
} from "./recurring-candidates-spec";

describe("recurringCandidatesSpecSchema", () => {
  const validCandidate = {
    id: "spotify-1",
    name: "Spotify",
    amount: 9.99,
    bankId: "bank_1",
    bankName: "Revolut",
    category: "SUSCRIPCIONES" as const,
    startMonth: "2026-07",
    suggested: true,
    reason: "sale todos los meses",
  };

  it("accepts a valid checklist spec", () => {
    const parsed = recurringCandidatesSpecSchema.safeParse({
      title: "¿Cuáles son recurrentes?",
      subtitle: "Marcá los que quieras convertir en plantilla.",
      candidates: [validCandidate],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects empty candidates", () => {
    expect(
      recurringCandidatesSpecSchema.safeParse({
        title: "Empty",
        candidates: [],
      }).success,
    ).toBe(false);
  });

  it("rejects more than 40 candidates", () => {
    const candidates = Array.from({ length: 41 }, (_, i) => ({
      ...validCandidate,
      id: `c-${i}`,
      name: `Item ${i}`,
    }));
    expect(
      recurringCandidatesSpecSchema.safeParse({
        title: "Too many",
        candidates,
      }).success,
    ).toBe(false);
  });

  it("leaves suggested and category optional on a candidate", () => {
    const parsed = recurringCandidateSchema.parse({
      id: "rent",
      name: "Alquiler",
      amount: 800,
      bankId: "bank_1",
      startMonth: "2026-07",
    });
    expect(parsed.suggested).toBeUndefined();
    expect(parsed.category).toBeUndefined();
  });
});
