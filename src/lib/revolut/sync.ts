import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  isUniqueViolation,
  parseIsoDate,
  todayUtcDate,
} from "@/lib/expense-line";
import { parseMonthKey, toMonthStart } from "@/lib/months";

import { classifyImportableTransactions } from "./import-classifier";
import {
  getAccountTransactions,
  resolveTransactionId,
  type GocardlessBookedTransaction,
} from "./gocardless";
import type { ImportableTransaction, MatchedLine } from "./types";

const AMOUNT_TOLERANCE = 0.02;

export type { ImportableTransaction, MatchedLine } from "./types";

function toIsoDateUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function monthUtcRange(monthKey: string): { from: string; to: string } {
  const start = toMonthStart(parseMonthKey(monthKey));
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth();
  const end = new Date(Date.UTC(y, m + 1, 0));
  return {
    from: toIsoDateUTC(start),
    to: toIsoDateUTC(end),
  };
}

/**
 * Fecha contable del movimiento. GoCardless devuelve `bookingDate` para
 * transacciones consolidadas y `valueDate` para algunas pendientes; cuando un
 * movimiento todavía no consolidó ninguna de las dos (Revolut suele etiquetar
 * estos como "today" en su UI), asumimos que ocurrió hoy. Devolvemos siempre
 * `yyyy-MM-dd` (UTC) para que `isDateInMonth` y la fecha guardada en
 * `MonthExpenseLine.occurredOn` sean consistentes entre zonas horarias.
 */
function parseBookingDate(tx: GocardlessBookedTransaction): string {
  const raw = tx.bookingDate ?? tx.valueDate;
  if (raw && raw.length >= 10) {
    return raw.slice(0, 10);
  }
  const today = todayUtcDate();
  const y = today.getUTCFullYear();
  const mo = String(today.getUTCMonth() + 1).padStart(2, "0");
  const day = String(today.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function isDateInMonth(dateStr: string, monthKey: string): boolean {
  return dateStr.startsWith(monthKey);
}

function txAmountNumber(tx: GocardlessBookedTransaction): number {
  return Number(tx.transactionAmount.amount);
}

function amountsMatch(lineAmount: number, txAmount: number): boolean {
  return Math.abs(Math.abs(txAmount) - lineAmount) <= AMOUNT_TOLERANCE;
}

function nameMatchesLine(lineName: string, tx: GocardlessBookedTransaction): boolean {
  const haystack = [
    tx.remittanceInformationUnstructured,
    tx.creditorName,
    tx.debtorName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!haystack.length) return false;

  const words = lineName
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9áéíóúñü]/gi, ""))
    .filter((w) => w.length >= 3);

  if (words.length === 0) return false;

  return words.some((w) => haystack.includes(w));
}

function buildDescription(tx: GocardlessBookedTransaction): string {
  return (
    tx.remittanceInformationUnstructured?.trim() ||
    tx.creditorName?.trim() ||
    tx.debtorName?.trim() ||
    "Movimiento"
  );
}

export async function runRevolutSyncForMonth(params: {
  userId: string;
  connectionId: string;
  accountId: string;
  monthKey: string;
  ignoredTransactionIds: Set<string>;
  /** Instrucciones del usuario para filtrar/categorizar importaciones (p. ej. no importar transferencias). */
  expenseImportInstructions?: string | null;
}): Promise<{
  matched: MatchedLine[];
  importable: ImportableTransaction[];
}> {
  const { from, to } = monthUtcRange(params.monthKey);

  const raw = await getAccountTransactions(params.accountId, { dateFrom: from, dateTo: to });

  const booked = raw.transactions.booked ?? [];

  const inMonth: GocardlessBookedTransaction[] = [];
  for (const tx of booked) {
    const id = resolveTransactionId(tx);
    if (!id || params.ignoredTransactionIds.has(id)) continue;
    const d = parseBookingDate(tx);
    if (!isDateInMonth(d, params.monthKey)) continue;
    inMonth.push(tx);
  }
  // Revolut/GoCardless puede devolver transacciones del día de hoy sin
  // bookingDate ni valueDate (estado pending). `parseBookingDate` las
  // resuelve a hoy, así que solo entran al loop cuando el monthKey es el
  // mes en curso (caso típico del usuario sincronizando a media tarde).

  const monthStart = toMonthStart(parseMonthKey(params.monthKey));
  const monthRecord = await db.monthRecord.findFirst({
    where: { userId: params.userId, month: monthStart },
    include: {
      lines: true,
    },
  });

  if (!monthRecord) {
    return { matched: [], importable: [] };
  }

  const unpaidLines = monthRecord.lines.filter((l) => !l.paid);
  const usedTxIds = new Set<string>();
  const matched: MatchedLine[] = [];

  for (const line of unpaidLines) {
    const lineAmount = Number(line.amount);
    const sameAmountCount = unpaidLines.filter((u) => amountsMatch(Number(u.amount), lineAmount)).length;

    const candidates = inMonth
      .map((tx) => {
        const id = resolveTransactionId(tx)!;
        if (usedTxIds.has(id)) return null;
        const amt = txAmountNumber(tx);
        if (amt >= 0) return null;
        if (!amountsMatch(lineAmount, amt)) return null;
        return { tx, id };
      })
      .filter((c): c is { tx: GocardlessBookedTransaction; id: string } => c !== null);

    if (candidates.length === 0) continue;

    let picked: (typeof candidates)[number] | null = null;
    if (sameAmountCount > 1) {
      picked = candidates.find((c) => nameMatchesLine(line.name, c.tx)) ?? null;
    } else {
      const withName = candidates.find((c) => nameMatchesLine(line.name, c.tx));
      picked = withName ?? candidates[0] ?? null;
    }

    if (!picked && candidates.length === 1) {
      picked = candidates[0]!;
    }

    if (picked) {
      usedTxIds.add(picked.id);
      matched.push({
        lineId: line.id,
        lineName: line.name,
        transactionId: picked.id,
        amount: picked.tx.transactionAmount.amount,
      });
    }
  }

  const toUpdate = matched.map((m) =>
    db.monthExpenseLine.update({
      where: { id: m.lineId },
      data: { paid: true },
    }),
  );
  if (toUpdate.length) {
    await db.$transaction(toUpdate);
  }

  await db.revolutConnection.update({
    where: { id: params.connectionId },
    data: { lastSyncAt: new Date() },
  });

  const importable: ImportableTransaction[] = [];
  for (const tx of inMonth) {
    const id = resolveTransactionId(tx)!;
    if (usedTxIds.has(id)) continue;
    const amt = txAmountNumber(tx);
    if (amt >= 0) continue;
    importable.push({
      transactionId: id,
      amount: tx.transactionAmount.amount,
      currency: tx.transactionAmount.currency,
      bookingDate: parseBookingDate(tx),
      description: buildDescription(tx),
    });
  }

  const importableFiltered = await classifyImportableTransactions(
    params.expenseImportInstructions ?? "",
    importable,
  );

  return { matched, importable: importableFiltered };
}

export async function importRevolutLine(params: {
  userId: string;
  monthKey: string;
  bankId: string;
  name: string;
  amount: number;
  /** Fecha real del movimiento (`yyyy-MM-dd`). Default: hoy. */
  bookingDate?: string;
}): Promise<
  | {
      duplicate: false;
      id: string;
      name: string;
      amount: string;
      bankId: string;
      bankName: string;
      paid: boolean;
      category: string;
    }
  | { duplicate: true }
> {
  const monthStart = toMonthStart(parseMonthKey(params.monthKey));
  const monthRecord = await db.monthRecord.findFirst({
    where: { userId: params.userId, month: monthStart },
  });
  if (!monthRecord) {
    throw new Error("MONTH_NOT_FOUND");
  }

  const bank = await db.bank.findFirst({ where: { id: params.bankId, userId: params.userId } });
  if (!bank) {
    throw new Error("BANK_NOT_FOUND");
  }

  const user = await db.user.findUnique({
    where: { id: params.userId },
    select: { primaryCurrency: true },
  });
  const primaryCurrency = user?.primaryCurrency ?? "USD";
  // Revolut imports come in already in the user's preferred currency for the
  // legacy helper. The new flow goes through `/api/months/[month]/lines` which
  // applies the FX lookup; this code path is kept for tests/back-compat only.
  const amount = new Prisma.Decimal(params.amount.toFixed(2));
  const occurredOn = parseIsoDate(params.bookingDate) ?? todayUtcDate();
  let line;
  try {
    line = await db.monthExpenseLine.create({
      data: {
        userId: params.userId,
        monthRecordId: monthRecord.id,
        templateId: null,
        bankId: params.bankId,
        name: params.name.trim(),
        occurredOn,
        amount,
        currency: primaryCurrency,
        fxRate: new Prisma.Decimal(1),
        amountConverted: amount,
        category: "OTROS",
        paid: false,
      },
      include: { bank: { select: { name: true } } },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { duplicate: true as const };
    }
    throw error;
  }

  return {
    duplicate: false as const,
    id: line.id,
    name: line.name,
    amount: line.amount.toString(),
    bankId: line.bankId,
    bankName: line.bank.name,
    paid: line.paid,
    category: line.category,
  };
}
