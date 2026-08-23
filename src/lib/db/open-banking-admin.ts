import { BankConnectionStatus } from "@prisma/client";

import { db } from "@/lib/db";

export async function getOpenBankingStats() {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    byStatus,
    syncs24h,
    imported7d,
    topAspsps,
    expiringSoon,
    recentExpired,
  ] = await Promise.all([
    db.bankConnection.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: { status: { not: BankConnectionStatus.DISCONNECTED } },
    }),
    db.bankSyncRun.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: { startedAt: { gte: dayAgo } },
    }),
    db.bankImportedTransaction.count({
      where: { importedAt: { gte: weekAgo }, ignored: false },
    }),
    db.bankConnection.groupBy({
      by: ["institutionName"],
      _count: { _all: true },
      where: { status: { not: BankConnectionStatus.DISCONNECTED } },
      orderBy: { _count: { institutionName: "desc" } },
      take: 5,
    }),
    db.bankConnection.findMany({
      where: {
        status: BankConnectionStatus.ACTIVE,
        validUntil: { gte: now, lte: weekAhead },
      },
      select: {
        id: true,
        institutionName: true,
        validUntil: true,
        user: { select: { email: true } },
      },
      take: 10,
    }),
    db.bankSyncRun.findMany({
      where: { errorCode: "EXPIRED_SESSION" },
      orderBy: { startedAt: "desc" },
      take: 5,
      include: {
        connection: {
          select: {
            institutionName: true,
            user: { select: { email: true } },
          },
        },
      },
    }),
  ]);

  const statusCount = (status: BankConnectionStatus) =>
    byStatus.find((row) => row.status === status)?._count._all ?? 0;

  return {
    connections: {
      active: statusCount(BankConnectionStatus.ACTIVE),
      needsReauth: statusCount(BankConnectionStatus.NEEDS_REAUTH),
      error: statusCount(BankConnectionStatus.ERROR),
      pending: statusCount(BankConnectionStatus.PENDING),
    },
    syncs24h: {
      success: syncs24h
        .filter((row) => row.status === "success")
        .reduce((sum, row) => sum + row._count._all, 0),
      error: syncs24h
        .filter((row) => row.status === "error")
        .reduce((sum, row) => sum + row._count._all, 0),
    },
    imported7d,
    topAspsps: topAspsps.map((row) => ({
      name: row.institutionName,
      count: row._count._all,
    })),
    expiringSoon: expiringSoon.map((row) => ({
      id: row.id,
      email: row.user.email,
      institutionName: row.institutionName,
      validUntil: row.validUntil?.toISOString() ?? null,
    })),
    recentExpired: recentExpired.map((row) => ({
      id: row.id,
      email: row.connection.user.email,
      institutionName: row.connection.institutionName,
      startedAt: row.startedAt.toISOString(),
    })),
  };
}

export async function listAdminConnections(opts: {
  status?: string;
  institutionName?: string;
  limit?: number;
  offset?: number;
}) {
  const where = {
    ...(opts.status ? { status: opts.status as BankConnectionStatus } : {}),
    ...(opts.institutionName
      ? { institutionName: { contains: opts.institutionName, mode: "insensitive" as const } }
      : {}),
  };
  const take = Math.min(opts.limit ?? 50, 200);
  const skip = opts.offset ?? 0;
  const [connections, total] = await Promise.all([
    db.bankConnection.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take,
      skip,
      include: {
        user: { select: { email: true } },
        accounts: { select: { id: true } },
      },
    }),
    db.bankConnection.count({ where }),
  ]);
  return {
    total,
    connections: connections.map((c) => ({
      id: c.id,
      email: c.user.email,
      institutionName: c.institutionName,
      institutionCountry: c.institutionCountry,
      status: c.status,
      validUntil: c.validUntil?.toISOString() ?? null,
      lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
      lastSyncError: c.lastSyncError,
      accountCount: c.accounts.length,
    })),
  };
}
