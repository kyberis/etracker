import { BankConnectionStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const markStatus = vi.fn();
const markSynced = vi.fn();
const findImported = vi.fn();
const recordImported = vi.fn();
const createRun = vi.fn();
const listTx = vi.fn();
const listBal = vi.fn();
const importExpense = vi.fn();
const importIncome = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    bankConnection: { findUnique: (...args: unknown[]) => findUnique(...args) },
    bank: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/crypto", () => ({
  decryptSecret: () => "plain-session",
}));

vi.mock("@/lib/db/bank-connections", () => ({
  findImportedTransaction: (...args: unknown[]) => findImported(...args),
  recordImportedTransaction: (...args: unknown[]) => recordImported(...args),
  markConnectionStatus: (...args: unknown[]) => markStatus(...args),
  markConnectionSynced: (...args: unknown[]) => markSynced(...args),
  upsertLinkedAccount: vi.fn(),
}));

vi.mock("@/lib/db/bank-sync-runs", () => ({
  createBankSyncRun: (...args: unknown[]) => createRun(...args),
}));

vi.mock("@/lib/enable-banking/client", () => {
  class EnableBankingApiError extends Error {
    constructor(
      public code: string,
      public httpStatus: number,
      message: string,
    ) {
      super(message);
      this.name = "EnableBankingApiError";
    }
  }
  return {
    EnableBankingApiError,
    listBalances: (...args: unknown[]) => listBal(...args),
    listTransactions: (...args: unknown[]) => listTx(...args),
    getSession: vi.fn(),
  };
});

vi.mock("@/lib/log", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("./import-line", () => ({
  importBankExpenseLine: (...args: unknown[]) => importExpense(...args),
  importBankIncomeLine: (...args: unknown[]) => importIncome(...args),
}));

import { EnableBankingApiError } from "@/lib/enable-banking/client";

import { syncConnection } from "./sync-connection";

beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue({
    id: "c1",
    userId: "u1",
    sessionId: "enc",
    accounts: [{ externalUid: "acc_1", bankId: "b1" }],
  });
  listBal.mockResolvedValue({ count: 1 });
  findImported.mockResolvedValue(null);
  recordImported.mockResolvedValue({});
  createRun.mockResolvedValue({});
  markSynced.mockResolvedValue({});
  markStatus.mockResolvedValue({});
});

describe("syncConnection", () => {
  it("imports new debit and income lines", async () => {
    listTx.mockResolvedValueOnce({
      continuationKey: null,
      transactions: [
        {
          transaction_id: "tx-1",
          booking_date: "2026-08-20",
          transaction_amount: { amount: "-10.00", currency: "EUR" },
          credit_debit_indicator: "DBIT",
          remittance_information: ["Coffee"],
        },
        {
          transaction_id: "tx-2",
          booking_date: "2026-08-19",
          transaction_amount: { amount: "100.00", currency: "EUR" },
          credit_debit_indicator: "CRDT",
          remittance_information: ["Refund"],
        },
      ],
    });
    importExpense.mockResolvedValue({
      ok: true,
      duplicate: false,
      lineId: "e1",
      lineType: "expense",
    });
    importIncome.mockResolvedValue({
      ok: true,
      duplicate: false,
      lineId: "i1",
      lineType: "income",
    });

    const result = await syncConnection({ connectionId: "c1", trigger: "manual" });
    expect(result.status).toBe("success");
    expect(result.transactionsImported).toBe(2);
    expect(importExpense).toHaveBeenCalled();
    expect(importIncome).toHaveBeenCalled();
  });

  it("skips already imported ids", async () => {
    findImported.mockResolvedValue({ id: "old" });
    listTx.mockResolvedValueOnce({
      continuationKey: null,
      transactions: [
        {
          transaction_id: "tx-1",
          booking_date: "2026-08-20",
          transaction_amount: { amount: "-10.00", currency: "EUR" },
          credit_debit_indicator: "DBIT",
          remittance_information: ["Coffee"],
        },
      ],
    });
    const result = await syncConnection({ connectionId: "c1", trigger: "cron" });
    expect(result.transactionsSkipped).toBe(1);
    expect(importExpense).not.toHaveBeenCalled();
  });

  it("marks NEEDS_REAUTH on EXPIRED_SESSION", async () => {
    listTx.mockRejectedValueOnce(
      new EnableBankingApiError("EXPIRED_SESSION", 401, "expired"),
    );
    const result = await syncConnection({ connectionId: "c1", trigger: "cron" });
    expect(result.errorCode).toBe("EXPIRED_SESSION");
    expect(markStatus).toHaveBeenCalledWith(
      "c1",
      BankConnectionStatus.NEEDS_REAUTH,
      expect.any(String),
    );
  });

  it("marks ERROR on 429", async () => {
    listTx.mockRejectedValueOnce(
      new EnableBankingApiError("RATE_LIMITED", 429, "slow down"),
    );
    const result = await syncConnection({ connectionId: "c1", trigger: "cron" });
    expect(result.errorCode).toBe("RATE_LIMIT");
    expect(markStatus).toHaveBeenCalledWith(
      "c1",
      BankConnectionStatus.ERROR,
      expect.any(String),
    );
  });
});
