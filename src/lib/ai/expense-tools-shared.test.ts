import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    eventShareToken: { create: vi.fn() },
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

vi.mock("@/lib/month-line-bucket", async () => {
  const actual = await vi.importActual<typeof import("@/lib/month-line-bucket")>(
    "@/lib/month-line-bucket",
  );
  return {
    ...actual,
    resolveMonthRecordId: vi.fn().mockResolvedValue("month_1"),
  };
});

vi.mock("@/lib/year-timeline-data", () => ({
  expireYearTimeline: vi.fn().mockResolvedValue(undefined),
}));

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
      occurredOn: new Date(Date.UTC(2026, 3, 15)),
      occurredOnSource: "USER",
      eventId: EVENT,
      paidByUserId: paidByUserId ?? null,
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

  it("falls back to standalone when occurredOn is outside the event range (REGULAR)", async () => {
    setupSharedEvent({ callerIsOwner: true, paidByUserId: OWNER });
    vi.mocked(db.monthExpenseLine.create).mockResolvedValue(
      {
        id: "line_oor",
        userId: OWNER,
        name: "Lunch",
        amount: 50,
        currency: "USD",
        fxRate: 1,
        amountConverted: 50,
        category: "OTROS",
        paid: true,
        eventId: null,
        paidByUserId: null,
        occurredOn: new Date(Date.UTC(2026, 4, 15)),
        occurredOnSource: "ARTIFACT",
      } as never,
    );
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
    expect(result).toMatchObject({ ok: true });
    expect((result as { note?: string }).note).toMatch(/outside/i);
    const createCall = vi.mocked(db.monthExpenseLine.create).mock.calls[0][0]
      .data as { eventId: string | null; userId: string };
    expect(createCall.eventId).toBeNull();
    expect(createCall.userId).toBe(OWNER);
  });

  it("GUEST rejects when occurredOn is outside the scoped event range", async () => {
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
        occurredOn: "2026-05-15", // after event.endDate
      },
      execOpts,
    );
    expect("error" in result).toBe(true);
    expect((result as { outOfRange?: boolean }).outOfRange).toBe(true);
    expect(db.monthExpenseLine.create).not.toHaveBeenCalled();
  });
});

describe("createEventShareLink", () => {
  const ORIGINAL_NEXTAUTH_URL = process.env.NEXTAUTH_URL;

  beforeEach(() => {
    // `buildShareUrl` reads `NEXTAUTH_URL` to compose the public URL.
    // Pin it so the assertion below doesn't depend on the test machine.
    process.env.NEXTAUTH_URL = "https://clara.example.com";
  });

  afterEach(() => {
    if (ORIGINAL_NEXTAUTH_URL === undefined) {
      delete process.env.NEXTAUTH_URL;
    } else {
      process.env.NEXTAUTH_URL = ORIGINAL_NEXTAUTH_URL;
    }
  });

  // CUID-shaped id so `cuidIdSchema` accepts it.
  const VALID_EVENT_ID = "cmofvkulj0004njis6x1voyzw";

  it("mints a fresh share-link when the caller owns the event", async () => {
    vi.mocked(db.event.findUnique).mockResolvedValue({
      userId: OWNER,
    } as never);
    const expiresAt = new Date("2026-06-01T00:00:00.000Z");
    vi.mocked(db.eventShareToken.create).mockResolvedValue({
      id: "tok_1",
      expiresAt,
    } as never);

    const t = buildExpenseTools(OWNER);
    const result = await t.createEventShareLink!.execute!(
      { eventId: VALID_EVENT_ID },
      execOpts,
    );

    expect(result).toMatchObject({ ok: true });
    const r = result as { url: string; expiresAt: string };
    // Token plaintext is random, so we assert on shape: base URL + locale + path + 43-char base64url token.
    expect(r.url).toMatch(
      /^https:\/\/clara\.example\.com\/es\/events\/share\/[A-Za-z0-9_-]{43}$/u,
    );
    expect(r.expiresAt).toBe(expiresAt.toISOString());
    expect(db.eventShareToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: VALID_EVENT_ID,
          createdById: OWNER,
        }),
      }),
    );
  });

  it("refuses to mint when the caller does NOT own the event", async () => {
    vi.mocked(db.event.findUnique).mockResolvedValue({
      userId: "u_someone_else",
    } as never);
    const t = buildExpenseTools(OWNER);
    const result = await t.createEventShareLink!.execute!(
      { eventId: VALID_EVENT_ID },
      execOpts,
    );
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/owner/i);
    expect(db.eventShareToken.create).not.toHaveBeenCalled();
  });

  it("is not exposed in the GUEST tool catalogue", () => {
    const t = buildExpenseTools(GUEST, {
      userKind: UserKind.GUEST,
      scopedEventId: EVENT,
    });
    expect((t as Record<string, unknown>).createEventShareLink).toBeUndefined();
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
