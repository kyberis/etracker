import { describe, expect, it } from "vitest";

import {
  buildRecurringCandidatesFromMonth,
  isLikelyRecurringLine,
  matchesExistingRecurringTemplate,
} from "./build-recurring-candidates-from-month";
import type { MonthLinePayload } from "@/lib/month-page-types";

function monthLine(
  overrides: Partial<MonthLinePayload> & Pick<MonthLinePayload, "id" | "name">,
): MonthLinePayload {
  return {
    amount: "100",
    currency: "USD",
    fxRate: "1",
    amountConverted: "100",
    bankId: "bank_1",
    bankName: "Revolut",
    paid: true,
    category: "OTROS",
    templateId: null,
    kind: "ONE_OFF",
    event: null,
    occurredOn: "2026-07-15",
    occurredOnSource: "USER",
    createdAt: "2026-07-15T12:00:00.000Z",
    ...overrides,
  };
}

describe("buildRecurringCandidatesFromMonth", () => {
  it("includes one-off lines and marks obvious subscriptions as suggested", () => {
    const candidates = buildRecurringCandidatesFromMonth({
      month: "2026-07",
      lines: [
        monthLine({ id: "l1", name: "Netflix", category: "SUSCRIPCIONES" }),
        monthLine({ id: "l2", name: "Café", category: "ALIMENTACION" }),
      ],
      existingTemplates: [],
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.name).toBe("Netflix");
    expect(candidates[0]?.suggested).toBe(true);
    expect(candidates[1]?.suggested).toBe(false);
  });

  it("skips recurring lines, event lines, and existing templates", () => {
    const candidates = buildRecurringCandidatesFromMonth({
      month: "2026-07",
      lines: [
        monthLine({
          id: "l1",
          name: "Spotify",
          kind: "RECURRING",
          templateId: "tpl_1",
        }),
        monthLine({
          id: "l2",
          name: "Hotel",
          event: {
            id: "ev_1",
            name: "Viaje",
            color: null,
            startDate: "2026-07-01",
            endDate: "2026-07-10",
            status: "OPEN",
          },
        }),
        monthLine({ id: "l3", name: "Alquiler", category: "VIVIENDA" }),
      ],
      existingTemplates: [
        {
          name: "Alquiler",
          amount: "100",
          bankId: "bank_1",
          isRecurring: true,
        },
      ],
    });

    expect(candidates).toHaveLength(0);
  });

  it("dedupes identical one-off rows in the same month", () => {
    const candidates = buildRecurringCandidatesFromMonth({
      month: "2026-07",
      lines: [
        monthLine({ id: "l1", name: "Spotify" }),
        monthLine({ id: "l2", name: "Spotify" }),
      ],
      existingTemplates: [],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.id).toBe("line-l1");
  });
});

describe("isLikelyRecurringLine", () => {
  it("detects housing and subscription categories", () => {
    expect(
      isLikelyRecurringLine(
        monthLine({ id: "l1", name: "Pago", category: "VIVIENDA" }),
      ),
    ).toBe(true);
  });
});

describe("matchesExistingRecurringTemplate", () => {
  it("matches normalized name and amount", () => {
    expect(
      matchesExistingRecurringTemplate(
        { name: "  Netflix ", bankId: "bank_1", amount: 15.99 },
        [
          {
            name: "netflix",
            amount: "15.99",
            bankId: "bank_1",
            isRecurring: true,
          },
        ],
      ),
    ).toBe(true);
  });
});
