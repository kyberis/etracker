import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  aspspListSchema,
  sessionSchema,
  transactionListSchema,
} from "./schemas";

const dir = dirname(fileURLToPath(import.meta.url));

function load(name: string) {
  return JSON.parse(readFileSync(join(dir, "__fixtures__", name), "utf8"));
}

describe("enable-banking schemas", () => {
  it("parses ASPSP list fixtures", () => {
    const parsed = aspspListSchema.parse(load("aspsps.json"));
    expect(parsed.aspsps).toHaveLength(2);
    expect(parsed.aspsps[0]?.name).toBe("Nordea");
  });

  it("parses session fixtures", () => {
    const parsed = sessionSchema.parse(load("session.json"));
    expect(parsed.session_id).toBe("sess_sandbox_123");
    expect(parsed.accounts[0]?.uid).toBe("acc_1");
  });

  it("parses transaction fixtures", () => {
    const parsed = transactionListSchema.parse(load("transactions.json"));
    expect(parsed.transactions).toHaveLength(2);
    expect(parsed.transactions[0]?.credit_debit_indicator).toBe("DBIT");
  });

  it("normalises remittance_information when the bank sends a string", () => {
    const parsed = transactionListSchema.parse({
      transactions: [
        {
          transaction_id: "tx-1",
          credit_debit_indicator: "DBIT",
          transaction_amount: { amount: "1.00", currency: "EUR" },
          remittance_information: "Cafe Martinez",
        },
      ],
    });
    expect(parsed.transactions[0]?.remittance_information).toEqual(["Cafe Martinez"]);
  });
});
