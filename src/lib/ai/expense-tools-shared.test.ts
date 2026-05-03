import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Focused tests for the GUEST scope + paidByUserId enforcement on
 * `addMonthLine`. We keep this in a separate file from the main
 * expense-tools test because the main file already runs ~1k lines
 * and rewiring its mock surface for shared events would be noisy.
 *
 * What we exercise:
 *   1. GUEST scope filters the catalogue down to event-only tools.
 *   2. addMonthLine (REGULAR) on a shared event with N≥2 active
 *      participants requires `paidByUserId`.
 *   3. addMonthLine rejects `paidByUserId` that doesn't map to an
 *      active participant.
 *   4. addMonthLine routes the line to the OWNER's books.
 *   5. listEventParticipants returns the active roster.
 */

vi.mock("@/lib/db", () => ({
  db: {
    bank: { findFirst: vi.fn() },
    monthExpenseLine: { create: vi.fn() },
    monthRecord: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    event: { findUnique: vi.fn() },
    eventParticipant: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("@/lib/cache/banks", () => ({
  getBanksCached: vi.fn(),
  invalidateBanksCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/savings", () => ({
  getSavingsState: vi.fn(),
  recordSavingsMovement: vi.fn(),
  setMonthlySavingsContribution: vi.fn(),
  removeMonthlySavingsContribution: vi.fn(),
  deleteSavingsMovement: vi.fn(),
  findManualDuplicateMovements: vi.fn(),
  deleteManualDuplicateMovements: vi.fn(),
}));

vi.mock("@/lib/month-bucket", async () => {
  const actual = await vi.importActual<typeof import("@/lib/month-bucket")>(
    "@/lib/month-bucket",
  );
  return {
    ...actual,
    applyPrevMonthLeftoverDecision: vi.fn(),
    mergePendingTemplateLinesIntoMonth: vi.fn(),
  };
});

vi.mock("@/lib/fx/rates", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/fx/rates")>("@/lib/fx/rates");
  return {
    ...actual,
    fetchFxRate: vi.fn(),
  };
});

import { buildExpenseTools } from "@/lib/ai/expense-tools";
import { db } from "@/lib/db";
import { UserKind } from "@prisma/client";

const OWNER = "u_owner";
const GUEST = "u_guest";
const EVENT = "evt_trip";
const BANK = "bank_owner";

/** ai-sdk's tool().execute requires a 2nd `options` arg we don't use here. */
const execOpts = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GUEST tool catalogue", () => {
  it("filters to the shared-event subset only", () => {
    const t = buildExpenseTools(GUEST, {
      userKind: UserKind.GUEST,
      scopedEventId: EVENT,
    });
    // Allowed
    expect(t.addMonthLine).toBeDefined();
    expect(t.listEventParticipants).toBeDefined();
    expect(t.getEvent).toBeDefined();
    expect(t.listEvents).toBeDefined();
    expect(t.renderChart).toBeDefined();
    expect(t.setUserLocale).toBeDefined();
    // Not allowed (sample)
    expect((t as Record<string, unknown>).createBank).toBeUndefined();
    expect((t as Record<string, unknown>).deleteBank).toBeUndefined();
    expect((t as Record<string, unknown>).updateExpenseTemplate).toBeUndefined();
    expect((t as Record<string, unknown>).addIncomeLine).toBeUndefined();
    expect((t as Record<string, unknown>).deleteSavingsMovement).toBeUndefined();
  });

  it("REGULAR users get the full catalogue", () => {
    const t = buildExpenseTools(OWNER);
    expect((t as Record<string, unknown>).createBank).toBeDefined();
    expect((t as Record<string, unknown>).addIncomeLine).toBeDefined();
  });
});

describe("addMonthLine — paidByUserId enforcement on shared events", () => {
  function setupSharedEvent({
    callerIsOwner,
    paidByUserId,
    paidByIsActive = true,
  }: {
    callerIsOwner: boolean;
    paidByUserId: string | undefined;
    paidByIsActive?: boolean;
  }) {
    const callerId = callerIsOwner ? OWNER : GUEST;
    vi.mocked(db.event.findUnique).mockResolvedValue({
      id: EVENT,
      name: "Trip",
      status: "OPEN",
      startDate: new Date("2026-04-01"),
      endDate: new Date("2026-04-30"),
      userId: OWNER,
    } as never);
    // The caller participant lookup (only relevant when caller != owner)
    // and the paidByUserId active-participant check both go through the
    // same `eventParticipant.findUnique`. The narrow type here matches
    // the routes we exercise; cast to `never` so TS doesn't try to
    // pattern-match Prisma's overloaded signatures.
    vi.mocked(db.eventParticipant.findUnique).mockImplementation(((args: {
      where: { eventId_userId: { userId: string } };
    }) => {
      const lookedUpUserId = args.where.eventId_userId.userId;
      if (lookedUpUserId === callerId && callerId !== OWNER) {
        return Promise.resolve({ removedAt: null } as never);
      }
      if (paidByUserId && lookedUpUserId === paidByUserId) {
        return Promise.resolve(
          (paidByIsActive
            ? { removedAt: null }
            : { removedAt: new Date() }) as never,
        );
      }
      return Promise.resolve(null);
    }) as never);
    vi.mocked(db.user.findUnique).mockResolvedValue({
      primaryCurrency: "USD",
    } as never);
    vi.mocked(db.monthRecord.findFirst).mockResolvedValue({
      id: "month_1",
      userId: OWNER,
    } as never);
    vi.mocked(db.bank.findFirst).mockResolvedValue({
      id: BANK,
      name: "Owner Bank",
    } as never);
    vi.mocked(db.monthExpenseLine.create).mockResolvedValue({
      id: "line_1",
      name: "Lunch",
      amount: new Prisma.Decimal(50),
      currency: "USD",
      fxRate: new Prisma.Decimal(1),
      amountConverted: new Prisma.Decimal(50),
      category: "OTROS",
      paid: true,
    } as never);
  }

  it("REGULAR owner can pass paidByUserId for any active participant", async () => {
    setupSharedEvent({ callerIsOwner: true, paidByUserId: GUEST });
    const t = buildExpenseTools(OWNER);
    const result = await t.addMonthLine.execute!(
      {
        name: "Lunch",
        amount: 50,
        bankId: BANK,
        category: "OTROS",
        paid: true,
        eventId: EVENT,
        paidByUserId: GUEST,
        occurredOn: "2026-04-15",
      },
      execOpts,
    );
    expect(result).toMatchObject({ ok: true });
    if ("ok" in result && result.ok) {
      expect((result as { line: { paidByUserId: string | null } }).line.paidByUserId).toBe(GUEST);
      // Line must be stored under the OWNER's userId (not the caller).
      const createCall = vi.mocked(db.monthExpenseLine.create).mock.calls[0][0]
        .data as { userId: string; paidByUserId: string | null };
      expect(createCall.userId).toBe(OWNER);
      expect(createCall.paidByUserId).toBe(GUEST);
    }
  });

  it("falls back to the current user when paidByUserId is not an active participant", async () => {
    // After the v0.11.2 forgiveness fix the tool no longer hard-errors on
    // a bogus paidByUserId — the model used to pass any CUID it had on
    // hand (a bank id, the user's own id, etc.) and the user could not
    // log anything. We now create the line with the caller as payer and
    // surface a `note` so the agent self-corrects on the next turn.
    setupSharedEvent({
      callerIsOwner: true,
      paidByUserId: "u_stranger",
      paidByIsActive: false,
    });
    const t = buildExpenseTools(OWNER);
    const result = await t.addMonthLine.execute!(
      {
        name: "Lunch",
        amount: 50,
        bankId: BANK,
        category: "OTROS",
        paid: true,
        eventId: EVENT,
        paidByUserId: "u_stranger",
        // Pin a date inside the event range so the failure mode under
        // test is the participant check, not the out-of-range guard.
        occurredOn: "2026-04-15",
      },
      execOpts,
    );
    expect(result).toMatchObject({ ok: true });
    expect((result as { note?: string }).note).toMatch(/not an active participant/i);
    expect((result as { line: { paidByUserId: string | null } }).line.paidByUserId).toBe(
      OWNER,
    );
    expect(db.monthExpenseLine.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paidByUserId: OWNER }),
      }),
    );
  });

  it("GUEST scope forces eventId, defaults paidByUserId to caller, stores under owner", async () => {
    setupSharedEvent({ callerIsOwner: false, paidByUserId: GUEST });
    const t = buildExpenseTools(GUEST, {
      userKind: UserKind.GUEST,
      scopedEventId: EVENT,
    });
    const result = await t.addMonthLine.execute!(
      {
        name: "Lunch",
        amount: 50,
        bankId: BANK,
        category: "OTROS",
        paid: true,
        // GUEST does NOT pass eventId — scopedEventId is enforced.
        occurredOn: "2026-04-15",
      },
      execOpts,
    );
    expect(result).toMatchObject({ ok: true });
    const createCall = vi.mocked(db.monthExpenseLine.create).mock.calls[0][0]
      .data as { userId: string; paidByUserId: string | null; eventId: string };
    expect(createCall.userId).toBe(OWNER);
    expect(createCall.eventId).toBe(EVENT);
    // Defaulted to the caller (the GUEST themselves).
    expect(createCall.paidByUserId).toBe(GUEST);
  });

  it("rejects when occurredOn is outside the event range", async () => {
    setupSharedEvent({ callerIsOwner: true, paidByUserId: OWNER });
    const t = buildExpenseTools(OWNER);
    const result = await t.addMonthLine.execute!(
      {
        name: "Lunch",
        amount: 50,
        bankId: BANK,
        category: "OTROS",
        paid: true,
        eventId: EVENT,
        paidByUserId: OWNER,
        occurredOn: "2026-05-15", // after event.endDate
      },
      execOpts,
    );
    expect("error" in result).toBe(true);
    expect((result as { outOfRange?: boolean }).outOfRange).toBe(true);
    expect(db.monthExpenseLine.create).not.toHaveBeenCalled();
  });
});

describe("listEventParticipants", () => {
  it("returns the active roster for the GUEST's scoped event", async () => {
    vi.mocked(db.event.findUnique).mockResolvedValue({
      id: EVENT,
      name: "Trip",
      userId: OWNER,
    } as never);
    vi.mocked(db.eventParticipant.findUnique).mockResolvedValue({
      removedAt: null,
    } as never);
    vi.mocked(db.eventParticipant.findMany).mockResolvedValue([
      {
        userId: OWNER,
        displayName: "Owner",
        role: "OWNER",
      },
      {
        userId: GUEST,
        displayName: "Guest",
        role: "GUEST",
      },
    ] as never);

    const t = buildExpenseTools(GUEST, {
      userKind: UserKind.GUEST,
      scopedEventId: EVENT,
    });
    // `eventId` is optional under GUEST scope; we still pass it as
    // `undefined` so the schema's runtime check is the source of truth.
    const result = await t.listEventParticipants.execute!(
      { eventId: undefined },
      execOpts,
    );
    expect("participants" in result).toBe(true);
    const r = result as {
      participants: Array<{ userId: string; role: string }>;
      currentUserId: string;
    };
    expect(r.currentUserId).toBe(GUEST);
    expect(r.participants.map((p) => p.userId)).toEqual([OWNER, GUEST]);
    expect(r.participants.find((p) => p.userId === OWNER)?.role).toBe("OWNER");
  });
});
