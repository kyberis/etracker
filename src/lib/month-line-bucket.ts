import { OccurrenceDateSource, type Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { parseIsoDate, todayUtcDate } from "@/lib/expense-line";
import { createMonthFromTemplates } from "@/lib/month-bucket";
import { formatMonthKey, toMonthStart } from "@/lib/months";
import { expireYearTimeline } from "@/lib/year-timeline-data";

export class TemplateLineRebucketError extends Error {
  constructor(message = "TEMPLATE_LINE_REBUCKET_NOT_ALLOWED") {
    super(message);
    this.name = "TemplateLineRebucketError";
  }
}

export class MonthLineNotFoundError extends Error {
  constructor(message = "LINE_NOT_FOUND") {
    super(message);
    this.name = "MonthLineNotFoundError";
  }
}

export class MonthOccurredOnMismatchError extends Error {
  constructor(
    public readonly pathMonth: string,
    public readonly occurredOnMonth: string,
  ) {
    super("MONTH_OCCURRED_ON_MISMATCH");
    this.name = "MonthOccurredOnMismatchError";
  }
}

/** Resolves create-time date + source from optional payload fields. */
export function resolveCreateOccurredOn(input: {
  occurredOn?: string;
  occurredOnSource?: OccurrenceDateSource;
}): { occurredOn: Date; occurredOnSource: OccurrenceDateSource } {
  const parsed = parseIsoDate(input.occurredOn);
  const occurredOn = parsed ?? todayUtcDate();
  const occurredOnSource =
    input.occurredOnSource ??
    (parsed ? OccurrenceDateSource.USER : OccurrenceDateSource.ESTIMATED);
  return { occurredOn, occurredOnSource };
}

/** Ensures REST `[month]` path matches the UTC month of `occurredOn`. */
export function assertPathMonthMatchesOccurredOn(
  pathMonthKey: string,
  occurredOn: Date,
): void {
  const expected = formatMonthKey(monthBucketStart(occurredOn));
  if (pathMonthKey !== expected) {
    throw new MonthOccurredOnMismatchError(pathMonthKey, expected);
  }
}

/** UTC month bucket (yyyy-MM-01) for a transaction date. */
export function monthBucketStart(occurredOn: Date): Date {
  return toMonthStart(occurredOn);
}

export type MonthRecordRef = {
  id: string;
  month: Date;
};

type DbClient = Prisma.TransactionClient | typeof db;

/**
 * Returns the `MonthRecord` for the UTC month of `occurredOn`, creating the
 * month from templates when it does not exist yet (same semantics as
 * `createMonthIfNeeded` / POST /api/months mode=templates).
 */
export async function ensureMonthRecordForOccurredOn(
  userId: string,
  occurredOn: Date,
  client: DbClient = db,
): Promise<MonthRecordRef> {
  const monthStart = monthBucketStart(occurredOn);
  const existing = await client.monthRecord.findFirst({
    where: { userId, month: monthStart },
    select: { id: true, month: true },
  });
  if (existing) {
    return existing;
  }

  const result = await createMonthFromTemplates(userId, formatMonthKey(monthStart));
  return { id: result.record.id, month: result.record.month };
}

/** Resolves (and lazily creates) the month bucket id for `occurredOn`. */
export async function resolveMonthRecordId(
  userId: string,
  occurredOn: Date,
  client: DbClient = db,
): Promise<string> {
  const record = await ensureMonthRecordForOccurredOn(userId, occurredOn, client);
  return record.id;
}

export type RebucketResult = {
  rebucketed: boolean;
  monthRecordId: string;
  previousMonthRecordId: string;
};

type RebucketOptions = {
  occurredOnSource?: OccurrenceDateSource;
  client?: DbClient;
};

async function expireTimelineForMonths(
  userId: string,
  ...months: Date[]
): Promise<void> {
  const years = new Set(months.map((m) => m.getUTCFullYear()));
  await Promise.all([...years].map((year) => expireYearTimeline(userId, year)));
}

/**
 * Moves an expense line to the bucket that matches `newOccurredOn` when the
 * month changes. Template-derived lines cannot change month bucket in v1.
 */
export async function rebucketExpenseLineIfNeeded(
  lineId: string,
  userId: string,
  newOccurredOn: Date,
  options: RebucketOptions = {},
): Promise<RebucketResult> {
  const client = options.client ?? db;
  const line = await client.monthExpenseLine.findFirst({
    where: { id: lineId, userId },
    include: { monthRecord: { select: { month: true } } },
  });
  if (!line) {
    throw new MonthLineNotFoundError();
  }

  const targetMonthStart = monthBucketStart(newOccurredOn);
  const currentMonthStart = monthBucketStart(line.monthRecord.month);

  if (targetMonthStart.getTime() === currentMonthStart.getTime()) {
    if (
      line.occurredOn.getTime() !== newOccurredOn.getTime() ||
      options.occurredOnSource !== undefined
    ) {
      await client.monthExpenseLine.update({
        where: { id: lineId },
        data: {
          occurredOn: newOccurredOn,
          ...(options.occurredOnSource !== undefined
            ? { occurredOnSource: options.occurredOnSource }
            : {}),
        },
      });
    }
    return {
      rebucketed: false,
      monthRecordId: line.monthRecordId,
      previousMonthRecordId: line.monthRecordId,
    };
  }

  if (line.templateId) {
    throw new TemplateLineRebucketError();
  }

  const target = await ensureMonthRecordForOccurredOn(userId, newOccurredOn, client);
  await client.monthExpenseLine.update({
    where: { id: lineId },
    data: {
      monthRecordId: target.id,
      occurredOn: newOccurredOn,
      ...(options.occurredOnSource !== undefined
        ? { occurredOnSource: options.occurredOnSource }
        : {}),
    },
  });

  await expireTimelineForMonths(userId, currentMonthStart, targetMonthStart);

  return {
    rebucketed: true,
    monthRecordId: target.id,
    previousMonthRecordId: line.monthRecordId,
  };
}

/** Income-line variant of {@link rebucketExpenseLineIfNeeded}. */
export async function rebucketIncomeLineIfNeeded(
  lineId: string,
  userId: string,
  newOccurredOn: Date,
  options: RebucketOptions = {},
): Promise<RebucketResult> {
  const client = options.client ?? db;
  const line = await client.monthIncomeLine.findFirst({
    where: { id: lineId, userId },
    include: { monthRecord: { select: { month: true } } },
  });
  if (!line) {
    throw new MonthLineNotFoundError();
  }

  const targetMonthStart = monthBucketStart(newOccurredOn);
  const currentMonthStart = monthBucketStart(line.monthRecord.month);

  if (targetMonthStart.getTime() === currentMonthStart.getTime()) {
    if (
      line.occurredOn.getTime() !== newOccurredOn.getTime() ||
      options.occurredOnSource !== undefined
    ) {
      await client.monthIncomeLine.update({
        where: { id: lineId },
        data: {
          occurredOn: newOccurredOn,
          ...(options.occurredOnSource !== undefined
            ? { occurredOnSource: options.occurredOnSource }
            : {}),
        },
      });
    }
    return {
      rebucketed: false,
      monthRecordId: line.monthRecordId,
      previousMonthRecordId: line.monthRecordId,
    };
  }

  if (line.templateId) {
    throw new TemplateLineRebucketError();
  }

  const target = await ensureMonthRecordForOccurredOn(userId, newOccurredOn, client);
  await client.monthIncomeLine.update({
    where: { id: lineId },
    data: {
      monthRecordId: target.id,
      occurredOn: newOccurredOn,
      ...(options.occurredOnSource !== undefined
        ? { occurredOnSource: options.occurredOnSource }
        : {}),
    },
  });

  await expireTimelineForMonths(userId, currentMonthStart, targetMonthStart);

  return {
    rebucketed: true,
    monthRecordId: target.id,
    previousMonthRecordId: line.monthRecordId,
  };
}
