import { db } from "@/lib/db";

export type BankSyncTrigger = "manual" | "cron" | "callback";
export type BankSyncRunStatus = "success" | "partial" | "error";

export async function createBankSyncRun(input: {
  connectionId: string;
  trigger: BankSyncTrigger;
  status: BankSyncRunStatus;
  transactionsFound: number;
  transactionsImported: number;
  transactionsSkipped: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  durationMs: number;
}) {
  return db.bankSyncRun.create({
    data: {
      connectionId: input.connectionId,
      trigger: input.trigger,
      status: input.status,
      transactionsFound: input.transactionsFound,
      transactionsImported: input.transactionsImported,
      transactionsSkipped: input.transactionsSkipped,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      durationMs: input.durationMs,
    },
  });
}

export async function listBankSyncRuns(opts: {
  userId?: string;
  connectionId?: string;
  status?: string;
  trigger?: string;
  limit?: number;
  offset?: number;
}) {
  const where = {
    ...(opts.connectionId ? { connectionId: opts.connectionId } : {}),
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.trigger ? { trigger: opts.trigger } : {}),
    ...(opts.userId ? { connection: { userId: opts.userId } } : {}),
  };
  const take = Math.min(opts.limit ?? 50, 200);
  const skip = opts.offset ?? 0;
  const [runs, total] = await Promise.all([
    db.bankSyncRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take,
      skip,
      include: {
        connection: {
          select: {
            id: true,
            userId: true,
            institutionName: true,
            institutionCountry: true,
            user: { select: { email: true } },
          },
        },
      },
    }),
    db.bankSyncRun.count({ where }),
  ]);
  return { runs, total };
}
