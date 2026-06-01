import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MAR_15 = new Date(Date.UTC(2026, 2, 15));
const APR_10 = new Date(Date.UTC(2026, 3, 10));
const MAR_START = new Date(Date.UTC(2026, 2, 1));
const APR_START = new Date(Date.UTC(2026, 3, 1));

const { mockDb, mockCreateMonthFromTemplates, mockExpireYearTimeline } = vi.hoisted(
  () => ({
    mockDb: {
      monthRecord: {
        findFirst: vi.fn(),
      },
      monthExpenseLine: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      monthIncomeLine: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    },
    mockCreateMonthFromTemplates: vi.fn(),
    mockExpireYearTimeline: vi.fn(),
  }),
);

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/month-bucket", () => ({
  createMonthFromTemplates: mockCreateMonthFromTemplates,
}));
vi.mock("@/lib/year-timeline-data", () => ({
  expireYearTimeline: mockExpireYearTimeline,
}));

import {
  MonthOccurredOnMismatchError,
  TemplateLineRebucketError,
  assertPathMonthMatchesOccurredOn,
  ensureMonthRecordForOccurredOn,
  monthBucketStart,
  rebucketExpenseLineIfNeeded,
  rebucketIncomeLineIfNeeded,
  resolveCreateOccurredOn,
  resolveMonthRecordId,
} from "./month-line-bucket";

const USER = "user_test";

beforeEach(() => {
  vi.clearAllMocks();
  mockExpireYearTimeline.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("monthBucketStart", () => {
  it("normalizes to UTC month start", () => {
    expect(monthBucketStart(MAR_15).toISOString()).toBe(MAR_START.toISOString());
    expect(monthBucketStart(APR_10).toISOString()).toBe(APR_START.toISOString());
  });
});

describe("ensureMonthRecordForOccurredOn", () => {
  it("returns an existing month record", async () => {
    mockDb.monthRecord.findFirst.mockResolvedValueOnce({
      id: "mr_mar",
      month: MAR_START,
    });

    const record = await ensureMonthRecordForOccurredOn(USER, MAR_15);
    expect(record).toEqual({ id: "mr_mar", month: MAR_START });
    expect(mockCreateMonthFromTemplates).not.toHaveBeenCalled();
  });

  it("creates the month from templates when missing", async () => {
    mockDb.monthRecord.findFirst.mockResolvedValueOnce(null);
    mockCreateMonthFromTemplates.mockResolvedValueOnce({
      type: "created",
      record: { id: "mr_apr", month: APR_START },
    });

    const record = await ensureMonthRecordForOccurredOn(USER, APR_10);
    expect(record.id).toBe("mr_apr");
    expect(mockCreateMonthFromTemplates).toHaveBeenCalledWith(USER, "2026-04");
  });
});

describe("resolveMonthRecordId", () => {
  it("returns the record id", async () => {
    mockDb.monthRecord.findFirst.mockResolvedValueOnce({
      id: "mr_mar",
      month: MAR_START,
    });

    await expect(resolveMonthRecordId(USER, MAR_15)).resolves.toBe("mr_mar");
  });
});

describe("resolveCreateOccurredOn", () => {
  it("defaults to today with ESTIMATED when no date is passed", () => {
    const { occurredOn, occurredOnSource } = resolveCreateOccurredOn({});
    expect(occurredOnSource).toBe("ESTIMATED");
    expect(occurredOn.toISOString().slice(0, 10)).toBe(
      new Date().toISOString().slice(0, 10),
    );
  });

  it("uses USER when an explicit date is passed", () => {
    const { occurredOn, occurredOnSource } = resolveCreateOccurredOn({
      occurredOn: "2026-03-15",
    });
    expect(occurredOnSource).toBe("USER");
    expect(occurredOn.toISOString()).toBe(MAR_15.toISOString());
  });
});

describe("assertPathMonthMatchesOccurredOn", () => {
  it("throws when path month differs from occurredOn month", () => {
    expect(() => assertPathMonthMatchesOccurredOn("2026-04", MAR_15)).toThrow(
      MonthOccurredOnMismatchError,
    );
  });

  it("passes when months align", () => {
    expect(() => assertPathMonthMatchesOccurredOn("2026-03", MAR_15)).not.toThrow();
  });
});

describe("rebucketExpenseLineIfNeeded", () => {
  it("updates occurredOn in-place when the bucket month is unchanged", async () => {
    mockDb.monthExpenseLine.findFirst.mockResolvedValueOnce({
      id: "line_1",
      userId: USER,
      monthRecordId: "mr_mar",
      templateId: null,
      occurredOn: MAR_15,
      monthRecord: { month: MAR_START },
    });
    mockDb.monthExpenseLine.update.mockResolvedValueOnce({});

    const result = await rebucketExpenseLineIfNeeded("line_1", USER, new Date(Date.UTC(2026, 2, 20)));

    expect(result.rebucketed).toBe(false);
    expect(result.monthRecordId).toBe("mr_mar");
    expect(mockDb.monthExpenseLine.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "line_1" },
        data: expect.objectContaining({
          occurredOn: new Date(Date.UTC(2026, 2, 20)),
        }),
      }),
    );
    expect(mockExpireYearTimeline).not.toHaveBeenCalled();
  });

  it("moves the line to another month bucket", async () => {
    mockDb.monthExpenseLine.findFirst.mockResolvedValueOnce({
      id: "line_1",
      userId: USER,
      monthRecordId: "mr_mar",
      templateId: null,
      occurredOn: MAR_15,
      monthRecord: { month: MAR_START },
    });
    mockDb.monthRecord.findFirst.mockResolvedValueOnce({
      id: "mr_apr",
      month: APR_START,
    });
    mockDb.monthExpenseLine.update.mockResolvedValueOnce({});

    const result = await rebucketExpenseLineIfNeeded("line_1", USER, APR_10);

    expect(result.rebucketed).toBe(true);
    expect(result.monthRecordId).toBe("mr_apr");
    expect(result.previousMonthRecordId).toBe("mr_mar");
    expect(mockDb.monthExpenseLine.update).toHaveBeenCalledWith({
      where: { id: "line_1" },
      data: {
        monthRecordId: "mr_apr",
        occurredOn: APR_10,
      },
    });
    expect(mockExpireYearTimeline).toHaveBeenCalledWith(USER, 2026);
  });

  it("rejects cross-month rebucket for template lines", async () => {
    mockDb.monthExpenseLine.findFirst.mockResolvedValueOnce({
      id: "line_tpl",
      userId: USER,
      monthRecordId: "mr_mar",
      templateId: "tpl_1",
      occurredOn: MAR_START,
      monthRecord: { month: MAR_START },
    });

    await expect(rebucketExpenseLineIfNeeded("line_tpl", USER, APR_10)).rejects.toBeInstanceOf(
      TemplateLineRebucketError,
    );
  });
});

describe("rebucketIncomeLineIfNeeded", () => {
  it("moves income lines across month buckets", async () => {
    mockDb.monthIncomeLine.findFirst.mockResolvedValueOnce({
      id: "inc_1",
      userId: USER,
      monthRecordId: "mr_mar",
      templateId: null,
      occurredOn: MAR_15,
      monthRecord: { month: MAR_START },
    });
    mockDb.monthRecord.findFirst.mockResolvedValueOnce({
      id: "mr_apr",
      month: APR_START,
    });
    mockDb.monthIncomeLine.update.mockResolvedValueOnce({});

    const result = await rebucketIncomeLineIfNeeded("inc_1", USER, APR_10);

    expect(result.rebucketed).toBe(true);
    expect(mockDb.monthIncomeLine.update).toHaveBeenCalledWith({
      where: { id: "inc_1" },
      data: {
        monthRecordId: "mr_apr",
        occurredOn: APR_10,
      },
    });
  });
});
