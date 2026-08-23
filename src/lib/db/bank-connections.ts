import {
  BankConnectionProvider,
  BankConnectionStatus,
  type Prisma,
} from "@prisma/client";

import type { PublicBankConnection } from "@/lib/bank-sync/public-connection";
import { db } from "@/lib/db";

const connectionSelect = {
  id: true,
  userId: true,
  provider: true,
  institutionName: true,
  institutionCountry: true,
  status: true,
  validUntil: true,
  lastSyncAt: true,
  lastSyncError: true,
  createdAt: true,
  updatedAt: true,
  accounts: {
    select: {
      id: true,
      externalUid: true,
      ibanMasked: true,
      name: true,
      currency: true,
      bankId: true,
      bank: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.BankConnectionSelect;

export type BankConnectionView = Prisma.BankConnectionGetPayload<{
  select: typeof connectionSelect;
}>;

const CONSENT_WARN_MS = 7 * 24 * 60 * 60 * 1000;

export type { PublicBankConnection };

export function serializePublicConnection(
  connection: BankConnectionView,
  now = new Date(),
): PublicBankConnection {
  return {
    id: connection.id,
    institutionName: connection.institutionName,
    institutionCountry: connection.institutionCountry,
    status: connection.status,
    validUntil: connection.validUntil?.toISOString() ?? null,
    lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
    lastSyncError: connection.lastSyncError,
    expiresSoon: Boolean(
      connection.validUntil &&
        connection.validUntil.getTime() - now.getTime() < CONSENT_WARN_MS,
    ),
    accounts: connection.accounts.map((account) => ({
      id: account.id,
      name: account.name,
      ibanMasked: account.ibanMasked,
      currency: account.currency,
      bankName: account.bank?.name ?? null,
    })),
  };
}

export async function listUserConnections(
  userId: string,
): Promise<BankConnectionView[]> {
  return db.bankConnection.findMany({
    where: {
      userId,
      status: { not: BankConnectionStatus.DISCONNECTED },
    },
    orderBy: { createdAt: "desc" },
    select: connectionSelect,
  });
}

export async function getConnectionForUser(
  userId: string,
  connectionId: string,
) {
  return db.bankConnection.findFirst({
    where: { id: connectionId, userId },
    include: { accounts: true },
  });
}

export async function createActiveConnection(input: {
  userId: string;
  institutionName: string;
  institutionCountry: string;
  encryptedSessionId: string;
  validUntil: Date | null;
}) {
  return db.bankConnection.create({
    data: {
      userId: input.userId,
      provider: BankConnectionProvider.ENABLE_BANKING,
      institutionName: input.institutionName,
      institutionCountry: input.institutionCountry,
      sessionId: input.encryptedSessionId,
      status: BankConnectionStatus.ACTIVE,
      validUntil: input.validUntil,
    },
  });
}

export async function markConnectionStatus(
  connectionId: string,
  status: BankConnectionStatus,
  lastSyncError?: string | null,
) {
  return db.bankConnection.update({
    where: { id: connectionId },
    data: {
      status,
      lastSyncError: lastSyncError === undefined ? undefined : lastSyncError,
    },
  });
}

export async function markConnectionSynced(
  connectionId: string,
  error?: string | null,
) {
  return db.bankConnection.update({
    where: { id: connectionId },
    data: {
      lastSyncAt: new Date(),
      lastSyncError: error ?? null,
      ...(error
        ? {}
        : { status: BankConnectionStatus.ACTIVE }),
    },
  });
}

export async function disconnectConnection(connectionId: string) {
  return db.bankConnection.update({
    where: { id: connectionId },
    data: {
      status: BankConnectionStatus.DISCONNECTED,
      lastSyncError: null,
    },
  });
}

export async function upsertLinkedAccount(input: {
  connectionId: string;
  externalUid: string;
  ibanMasked: string | null;
  name: string | null;
  currency: string;
  bankId: string;
}) {
  return db.bankLinkedAccount.upsert({
    where: {
      connectionId_externalUid: {
        connectionId: input.connectionId,
        externalUid: input.externalUid,
      },
    },
    create: input,
    update: {
      ibanMasked: input.ibanMasked,
      name: input.name,
      currency: input.currency,
      bankId: input.bankId,
    },
  });
}

export async function findImportedTransaction(
  connectionId: string,
  externalId: string,
) {
  return db.bankImportedTransaction.findUnique({
    where: {
      connectionId_externalId: { connectionId, externalId },
    },
  });
}

export async function recordImportedTransaction(input: {
  connectionId: string;
  externalId: string;
  monthLineId: string | null;
  lineType: "expense" | "income" | null;
  rawPayload: Prisma.InputJsonValue;
  ignored?: boolean;
}) {
  return db.bankImportedTransaction.create({
    data: {
      connectionId: input.connectionId,
      externalId: input.externalId,
      monthLineId: input.monthLineId,
      lineType: input.lineType,
      rawPayload: input.rawPayload,
      ignored: input.ignored ?? false,
    },
  });
}

export async function listActiveConnectionsForSync() {
  return db.bankConnection.findMany({
    where: {
      status: {
        in: [BankConnectionStatus.ACTIVE, BankConnectionStatus.ERROR],
      },
      provider: BankConnectionProvider.ENABLE_BANKING,
    },
    include: { accounts: true },
  });
}
