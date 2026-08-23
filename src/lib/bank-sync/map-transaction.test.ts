import { describe, expect, it } from "vitest";

import {
  isPlaceholderTransactionName,
  mapEnableBankingTransaction,
} from "./map-transaction";

describe("mapEnableBankingTransaction", () => {
  it("maps a debit restaurant spend", () => {
    const mapped = mapEnableBankingTransaction({
      transaction_id: { transaction_id: "tx-1" },
      booking_date: "2026-08-20",
      transaction_amount: { amount: "-12.50", currency: "EUR" },
      credit_debit_indicator: "DBIT",
      remittance_information: ["Cafe Martinez"],
      bank_transaction_code: { description: "restaurant" },
    });
    expect(mapped.externalId).toBe("tx-1");
    expect(mapped.isCredit).toBe(false);
    expect(mapped.amount).toBe(12.5);
    expect(mapped.currency).toBe("EUR");
    expect(mapped.name).toBe("Cafe Martinez");
    expect(mapped.expenseCategory).toBe("ALIMENTACION");
    expect(mapped.occurredOn.toISOString().slice(0, 10)).toBe("2026-08-20");
  });

  it("maps a salary credit", () => {
    const mapped = mapEnableBankingTransaction({
      transaction_id: "tx-2",
      value_date: "2026-08-19",
      transaction_amount: { amount: "1500.00", currency: "EUR" },
      credit_debit_indicator: "CRDT",
      remittance_information: ["August salary"],
    });
    expect(mapped.isCredit).toBe(true);
    expect(mapped.incomeCategory).toBe("SUELDO");
    expect(mapped.amount).toBe(1500);
  });

  it("prefers the counterparty name over a remittance archive id", () => {
    const mapped = mapEnableBankingTransaction({
      transaction_id: "tx-3",
      entry_reference: "5561990681",
      booking_date: "2026-08-20",
      transaction_amount: { amount: "-8.20", currency: "EUR" },
      credit_debit_indicator: "DBIT",
      remittance_information: ["5561990681"],
      creditor: { name: "Mercadona" },
    });
    expect(mapped.name).toBe("Mercadona");
  });

  it("skips uuid remittance and uses the counterparty name", () => {
    const mapped = mapEnableBankingTransaction({
      transaction_id: "7cc67f4-45d6-494b-adac-09b5cbc7e2b5",
      booking_date: "2026-08-20",
      transaction_amount: { amount: "-4.00", currency: "EUR" },
      credit_debit_indicator: "DBIT",
      remittance_information: ["07cc67f4-45d6-494b-adac-09b5cbc7e2b5"],
      debtor: { name: "Acme Payroll" },
    });
    expect(mapped.name).toBe("Acme Payroll");
  });

  it("falls back to a generic label when only ids are present", () => {
    const mapped = mapEnableBankingTransaction({
      transaction_id: "tx-only",
      entry_reference: "999",
      booking_date: "2026-08-20",
      transaction_amount: { amount: "-1.00", currency: "EUR" },
      credit_debit_indicator: "DBIT",
      remittance_information: ["999"],
    });
    expect(mapped.name).toBe("Movimiento bancario");
  });

  it("detects placeholder names that are only ids", () => {
    expect(isPlaceholderTransactionName("5561990681")).toBe(true);
    expect(isPlaceholderTransactionName("Mercadona")).toBe(false);
  });
});
