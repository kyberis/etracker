import { parseIsoDate, todayUtcDate } from "@/lib/expense-line";

import type { EnableBankingTransaction } from "@/lib/enable-banking/schemas";

import { categorizeExpense, categorizeIncome } from "./categorize";

export type MappedBankTransaction = {
  externalId: string;
  name: string;
  amount: number;
  currency: string;
  occurredOn: Date;
  isCredit: boolean;
  expenseCategory: ReturnType<typeof categorizeExpense>;
  incomeCategory: ReturnType<typeof categorizeIncome>;
};

function pickDate(tx: EnableBankingTransaction): Date {
  const raw =
    tx.booking_date ?? tx.value_date ?? tx.transaction_date ?? undefined;
  if (!raw) return todayUtcDate();
  const iso = raw.slice(0, 10);
  return parseIsoDate(iso) ?? todayUtcDate();
}

export function isPlaceholderTransactionName(name: string): boolean {
  const text = name.trim();
  if (!text || text === "Movimiento bancario") return true;
  if (/^[0-9][0-9.\s\-/]{2,}$/.test(text)) return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    text,
  );
}

function looksLikeId(value: string, tx: EnableBankingTransaction): boolean {
  const text = value.trim();
  if (!text) return true;
  if (/^[0-9][0-9.\s\-/]{2,}$/.test(text)) return true;
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)
  ) {
    return true;
  }
  if (tx.entry_reference && text === tx.entry_reference) return true;
  if (typeof tx.transaction_id === "string" && text === tx.transaction_id) {
    return true;
  }
  if (
    tx.transaction_id &&
    typeof tx.transaction_id === "object" &&
    text === tx.transaction_id.transaction_id
  ) {
    return true;
  }
  return false;
}

function usableLines(
  values: Array<string | null | undefined>,
  tx: EnableBankingTransaction,
): string[] {
  return values
    .flatMap((value) => (value ? value.split(/\s*[|;]\s*/) : []))
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && !looksLikeId(value, tx));
}

function remittanceLines(tx: EnableBankingTransaction): string[] {
  const raw = tx.remittance_information as unknown;
  if (Array.isArray(raw)) {
    return raw.filter((line): line is string => typeof line === "string");
  }
  if (typeof raw === "string" && raw.trim()) return [raw];
  return [];
}

function pickName(tx: EnableBankingTransaction): string {
  const party = usableLines(
    [
      tx.creditor?.name,
      tx.debtor?.name,
      tx.creditor_agent?.name,
      tx.debtor_agent?.name,
    ],
    tx,
  )[0];
  const remittance = usableLines(remittanceLines(tx), tx).join(" ");
  const note = usableLines([tx.note], tx)[0];
  const code = tx.bank_transaction_code?.description?.trim();

  if (party && remittance && !remittance.toLowerCase().includes(party.toLowerCase())) {
    return `${party} · ${remittance}`.slice(0, 180);
  }
  if (party) return party.slice(0, 180);
  if (remittance) return remittance.slice(0, 180);
  if (note) return note.slice(0, 180);
  if (code && !looksLikeId(code, tx)) return code.slice(0, 180);
  return "Movimiento bancario";
}

function pickExternalId(
  tx: EnableBankingTransaction,
  fallbackIndex: number,
): string {
  if (typeof tx.transaction_id === "string" && tx.transaction_id) {
    return tx.transaction_id;
  }
  if (
    tx.transaction_id &&
    typeof tx.transaction_id === "object" &&
    tx.transaction_id.transaction_id
  ) {
    return tx.transaction_id.transaction_id;
  }
  if (tx.entry_reference) return tx.entry_reference;
  const date = (tx.booking_date ?? tx.value_date ?? "").slice(0, 10);
  const amount = tx.transaction_amount?.amount ?? "";
  return `fallback:${date}:${amount}:${fallbackIndex}`;
}

function toAmount(raw: string | number | undefined): number {
  if (raw === undefined) return 0;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

export function mapEnableBankingTransaction(
  tx: EnableBankingTransaction,
  fallbackIndex = 0,
): MappedBankTransaction {
  const signed = toAmount(tx.transaction_amount?.amount);
  const indicator = tx.credit_debit_indicator;
  const rawSigned =
    typeof tx.transaction_amount?.amount === "string"
      ? Number(String(tx.transaction_amount.amount).replace(",", "."))
      : typeof tx.transaction_amount?.amount === "number"
        ? tx.transaction_amount.amount
        : 0;
  const isCredit =
    indicator === "CRDT" || (indicator !== "DBIT" && rawSigned > 0);
  const name = pickName(tx);
  const blob = [
    name,
    tx.bank_transaction_code?.description ?? "",
    tx.bank_transaction_code?.code ?? "",
  ].join(" ");

  return {
    externalId: pickExternalId(tx, fallbackIndex),
    name,
    amount: signed,
    currency: (tx.transaction_amount?.currency ?? "EUR").toUpperCase(),
    occurredOn: pickDate(tx),
    isCredit,
    expenseCategory: categorizeExpense(blob),
    incomeCategory: categorizeIncome(blob),
  };
}
