import { BankConnectionStatus, Prisma } from "@prisma/client";

import { invalidateBanksCache } from "@/lib/cache/banks";
import { decryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import {
  findImportedTransaction,
  markConnectionStatus,
  markConnectionSynced,
  recordImportedTransaction,
  upsertLinkedAccount,
} from "@/lib/db/bank-connections";
import { createBankSyncRun, type BankSyncTrigger } from "@/lib/db/bank-sync-runs";
import {
  EnableBankingApiError,
  getSession,
  listBalances,
  listTransactions,
  type PsuContext,
} from "@/lib/enable-banking/client";
import { log } from "@/lib/log";

import { importBankExpenseLine, importBankIncomeLine } from "./import-line";
import {
  isPlaceholderTransactionName,
  mapEnableBankingTransaction,
} from "./map-transaction";

export type SyncConnectionResult = {
  connectionId: string;
  status: "success" | "partial" | "error";
  transactionsFound: number;
  transactionsImported: number;
  transactionsSkipped: number;
  errorCode?: string;
  errorMessage?: string;
};

function maskIban(iban: string | undefined): string | null {
  if (!iban) return null;
  const compact = iban.replace(/\s+/g, "");
  if (compact.length < 8) return `****${compact.slice(-2)}`;
  return `${compact.slice(0, 4)}••••${compact.slice(-4)}`;
}

async function refreshPlaceholderLineName(
  lineType: string,
  lineId: string,
  name: string,
): Promise<void> {
  if (lineType === "income") {
    const current = await db.monthIncomeLine.findUnique({
      where: { id: lineId },
      select: { name: true },
    });
    if (current && isPlaceholderTransactionName(current.name)) {
      await db.monthIncomeLine.update({
        where: { id: lineId },
        data: { name },
      });
    }
    return;
  }
  const current = await db.monthExpenseLine.findUnique({
    where: { id: lineId },
    select: { name: true },
  });
  if (current && isPlaceholderTransactionName(current.name)) {
    await db.monthExpenseLine.update({
      where: { id: lineId },
      data: { name },
    });
  }
}

function bankNameForAccount(input: {
  institutionName: string;
  iban?: string;
  accountName?: string | null;
  currency: string;
}): string {
  const last4 = input.iban ? input.iban.replace(/\s+/g, "").slice(-4) : "";
  if (last4) return `${input.institutionName} ${last4}`;
  if (input.accountName) return `${input.institutionName} ${input.accountName}`;
  return `${input.institutionName} ${input.currency}`;
}

async function ensureBankForAccount(input: {
  userId: string;
  institutionName: string;
  iban?: string;
  accountName?: string | null;
  currency: string;
}): Promise<string> {
  const base = bankNameForAccount(input);
  const existing = await db.bank.findFirst({
    where: { userId: input.userId, name: base },
    select: { id: true },
  });
  if (existing) return existing.id;
  try {
    const created = await db.bank.create({
      data: { userId: input.userId, name: base },
      select: { id: true },
    });
    await invalidateBanksCache(input.userId);
    return created.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const again = await db.bank.findFirst({
        where: { userId: input.userId, name: `${base} ${input.currency}` },
        select: { id: true },
      });
      if (again) return again.id;
      const created = await db.bank.create({
        data: { userId: input.userId, name: `${base} ${input.currency}` },
        select: { id: true },
      });
      await invalidateBanksCache(input.userId);
      return created.id;
    }
    throw error;
  }
}

export async function syncConnection(input: {
  connectionId: string;
  trigger: BankSyncTrigger;
  psu?: PsuContext;
  dateFrom?: string;
}): Promise<SyncConnectionResult> {
  const started = Date.now();
  const connection = await db.bankConnection.findUnique({
    where: { id: input.connectionId },
    include: { accounts: true },
  });
  if (!connection) {
    return {
      connectionId: input.connectionId,
      status: "error",
      transactionsFound: 0,
      transactionsImported: 0,
      transactionsSkipped: 0,
      errorCode: "CONNECTION_NOT_FOUND",
      errorMessage: "Connection not found.",
    };
  }

  log.info("enable_banking.sync.start", {
    connectionId: connection.id,
    userId: connection.userId,
    trigger: input.trigger,
  });

  let found = 0;
  let imported = 0;
  let skipped = 0;
  let errorCode: string | undefined;
  let errorMessage: string | undefined;

  try {
    const sessionId = decryptSecret(connection.sessionId);
    if (!sessionId) {
      throw new Error("INVALID_SESSION");
    }
    let accounts = connection.accounts;
    if (accounts.length === 0) {
      const session = await getSession({
        userId: connection.userId,
        connectionId: connection.id,
        sessionId,
      });
      await linkSessionAccounts({
        userId: connection.userId,
        connectionId: connection.id,
        institutionName: connection.institutionName,
        accounts: session.accounts,
      });
      const refreshed = await db.bankConnection.findUnique({
        where: { id: connection.id },
        include: { accounts: true },
      });
      accounts = refreshed?.accounts ?? [];
    }
    if (accounts.length === 0) {
      throw new Error("NO_LINKED_ACCOUNTS");
    }

    for (const account of accounts) {
      try {
        await listBalances({
          userId: connection.userId,
          connectionId: connection.id,
          accountUid: account.externalUid,
          psu: input.psu,
        });
      } catch (error) {
        if (error instanceof EnableBankingApiError && error.code === "EXPIRED_SESSION") {
          throw error;
        }
        log.warn("enable_banking.sync.balances_failed", {
          connectionId: connection.id,
          accountUid: account.externalUid,
          message: error instanceof Error ? error.message : String(error),
        });
      }

      let continuation: string | undefined;
      do {
        const page = await listTransactions({
          userId: connection.userId,
          connectionId: connection.id,
          accountUid: account.externalUid,
          dateFrom: input.dateFrom,
          continuationKey: continuation,
          psu: input.psu,
        });
        continuation = page.continuationKey ?? undefined;
        let index = 0;
        for (const raw of page.transactions) {
          found += 1;
          const mapped = mapEnableBankingTransaction(raw, index++);
          if (mapped.amount <= 0) {
            skipped += 1;
            continue;
          }
          const already = await findImportedTransaction(
            connection.id,
            mapped.externalId,
          );
          if (already) {
            if (
              already.monthLineId &&
              already.lineType &&
              !already.ignored &&
              !isPlaceholderTransactionName(mapped.name)
            ) {
              await refreshPlaceholderLineName(
                already.lineType,
                already.monthLineId,
                mapped.name,
              );
            }
            skipped += 1;
            continue;
          }

          const result = mapped.isCredit
            ? await importBankIncomeLine({
                userId: connection.userId,
                bankId: account.bankId ?? "",
                name: mapped.name,
                amount: mapped.amount,
                currency: mapped.currency,
                occurredOn: mapped.occurredOn,
                category: mapped.incomeCategory,
              })
            : await importBankExpenseLine({
                userId: connection.userId,
                bankId: account.bankId ?? "",
                name: mapped.name,
                amount: mapped.amount,
                currency: mapped.currency,
                occurredOn: mapped.occurredOn,
                category: mapped.expenseCategory,
              });

          if (!result.ok || !account.bankId) {
            skipped += 1;
            await recordImportedTransaction({
              connectionId: connection.id,
              externalId: mapped.externalId,
              monthLineId: null,
              lineType: mapped.isCredit ? "income" : "expense",
              rawPayload: {
                externalId: mapped.externalId,
                amount: mapped.amount,
                currency: mapped.currency,
                occurredOn: mapped.occurredOn.toISOString().slice(0, 10),
                error: result.ok ? "NO_BANK" : result.error,
              },
              ignored: true,
            }).catch(() => undefined);
            continue;
          }

          await recordImportedTransaction({
            connectionId: connection.id,
            externalId: mapped.externalId,
            monthLineId: result.lineId,
            lineType: result.lineType,
            rawPayload: {
              externalId: mapped.externalId,
              amount: mapped.amount,
              currency: mapped.currency,
              occurredOn: mapped.occurredOn.toISOString().slice(0, 10),
              isCredit: mapped.isCredit,
            },
          });
          if (result.duplicate) skipped += 1;
          else imported += 1;
        }
      } while (continuation);
    }

    await markConnectionSynced(connection.id, null);
    const status = imported === 0 && found > 0 && skipped === found ? "success" : "success";
    const durationMs = Date.now() - started;
    await createBankSyncRun({
      connectionId: connection.id,
      trigger: input.trigger,
      status,
      transactionsFound: found,
      transactionsImported: imported,
      transactionsSkipped: skipped,
      durationMs,
    });
    log.info("enable_banking.sync.complete", {
      connectionId: connection.id,
      userId: connection.userId,
      found,
      imported,
      skipped,
      durationMs,
    });
    return {
      connectionId: connection.id,
      status,
      transactionsFound: found,
      transactionsImported: imported,
      transactionsSkipped: skipped,
    };
  } catch (error) {
    const durationMs = Date.now() - started;
    if (error instanceof EnableBankingApiError && error.code === "EXPIRED_SESSION") {
      errorCode = "EXPIRED_SESSION";
      errorMessage = "El consentimiento del banco venció. Hay que reconectar.";
      await markConnectionStatus(
        connection.id,
        BankConnectionStatus.NEEDS_REAUTH,
        errorMessage,
      );
      log.warn("enable_banking.sync.expired_session", {
        connectionId: connection.id,
        userId: connection.userId,
      });
    } else if (error instanceof EnableBankingApiError && error.httpStatus === 429) {
      errorCode = "RATE_LIMIT";
      errorMessage = "El banco limitó las consultas. Reintento en el próximo ciclo.";
      await markConnectionStatus(connection.id, BankConnectionStatus.ERROR, errorMessage);
    } else {
      errorCode =
        error instanceof EnableBankingApiError ? error.code : "SYNC_FAILED";
      errorMessage = error instanceof Error ? error.message : String(error);
      await markConnectionStatus(connection.id, BankConnectionStatus.ERROR, errorMessage);
    }
    await createBankSyncRun({
      connectionId: connection.id,
      trigger: input.trigger,
      status: "error",
      transactionsFound: found,
      transactionsImported: imported,
      transactionsSkipped: skipped,
      errorCode,
      errorMessage,
      durationMs,
    });
    return {
      connectionId: connection.id,
      status: "error",
      transactionsFound: found,
      transactionsImported: imported,
      transactionsSkipped: skipped,
      errorCode,
      errorMessage,
    };
  }
}

export async function linkSessionAccounts(input: {
  userId: string;
  connectionId: string;
  institutionName: string;
  accounts: Array<{
    uid?: string;
    name?: string | null;
    details?: string | null;
    product?: string | null;
    currency?: string | null;
    identification?: { iban?: string | null };
    account_id?: { iban?: string | null };
  }>;
}): Promise<number> {
  let linked = 0;
  for (const account of input.accounts) {
    if (!account.uid) continue;
    const iban = account.identification?.iban ?? account.account_id?.iban;
    const currency = (account.currency ?? "EUR").toUpperCase();
    const accountName = account.details ?? account.product ?? account.name ?? null;
    const bankId = await ensureBankForAccount({
      userId: input.userId,
      institutionName: input.institutionName,
      iban,
      accountName,
      currency,
    });
    await upsertLinkedAccount({
      connectionId: input.connectionId,
      externalUid: account.uid,
      ibanMasked: maskIban(iban),
      name: accountName,
      currency,
      bankId,
    });
    linked += 1;
  }
  return linked;
}
