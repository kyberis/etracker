import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the share-token primitives in `events-share.ts`. We mock
 * the Prisma client with a tiny in-memory store backing
 * `eventShareToken` so the tests don't need a real database.
 *
 * We exercise:
 *   - mint → returns plaintext + tokenId + expiresAt
 *   - mint stores the SHA-256 hash, never the plaintext
 *   - verify happy path, expired, revoked, garbage / missing input
 *   - markUsed bumps `lastUsedAt`
 *   - revoke is owner-only and idempotent
 *   - buildShareUrl uses base URL + locale + token (URL-safe)
 */

import { createHash } from "node:crypto";

type ShareTokenRow = {
  id: string;
  eventId: string;
  createdById: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
};

type EventRow = { id: string; userId: string };

const store = {
  tokens: new Map<string, ShareTokenRow>(),
  events: new Map<string, EventRow>(),
  seq: 0,
};

function reset() {
  store.tokens.clear();
  store.events.clear();
  store.seq = 0;
}

const lazyDb = vi.hoisted(() => ({ db: {} as Record<string, unknown> }));
vi.mock("@/lib/db", () => ({ db: lazyDb.db }));

const dbClient = {
  eventShareToken: {
    create: vi.fn(
      async ({
        data,
      }: {
        data: {
          eventId: string;
          createdById: string;
          tokenHash: string;
          expiresAt: Date;
        };
      }) => {
        store.seq += 1;
        const row: ShareTokenRow = {
          id: `tok_${store.seq}`,
          eventId: data.eventId,
          createdById: data.createdById,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          revokedAt: null,
          lastUsedAt: null,
          createdAt: new Date(),
        };
        store.tokens.set(row.id, row);
        return { id: row.id, expiresAt: row.expiresAt };
      },
    ),
    findUnique: vi.fn(
      async ({
        where,
      }: {
        where: { tokenHash?: string; id?: string };
      }) => {
        if ("tokenHash" in where && where.tokenHash) {
          for (const row of store.tokens.values()) {
            if (row.tokenHash === where.tokenHash) {
              return {
                id: row.id,
                eventId: row.eventId,
                createdById: row.createdById,
                expiresAt: row.expiresAt,
                revokedAt: row.revokedAt,
                event: {
                  userId: store.events.get(row.eventId)?.userId ?? "?",
                },
              };
            }
          }
          return null;
        }
        if ("id" in where && where.id) {
          const row = store.tokens.get(where.id);
          if (!row) return null;
          return {
            id: row.id,
            revokedAt: row.revokedAt,
            event: {
              userId: store.events.get(row.eventId)?.userId ?? "?",
            },
          };
        }
        return null;
      },
    ),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<ShareTokenRow>;
      }) => {
        const row = store.tokens.get(where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, data);
        return row;
      },
    ),
  },
};

beforeEach(() => {
  reset();
  Object.assign(lazyDb.db, dbClient);
});

afterEach(() => {
  vi.clearAllMocks();
});

import {
  buildShareUrl,
  markShareTokenUsed,
  mintShareToken,
  revokeShareToken,
  verifyShareToken,
} from "@/lib/events-share";

function seedEvent(args: { id: string; userId: string }) {
  store.events.set(args.id, args);
}

describe("mintShareToken", () => {
  it("returns plaintext + tokenId + expiresAt", async () => {
    seedEvent({ id: "evt_1", userId: "owner_1" });
    const result = await mintShareToken({
      eventId: "evt_1",
      createdById: "owner_1",
    });
    expect(typeof result.token).toBe("string");
    expect(result.token.length).toBeGreaterThanOrEqual(40);
    expect(result.token).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(result.tokenId).toBe("tok_1");
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("stores ONLY the sha256 hash, never the plaintext", async () => {
    seedEvent({ id: "evt_1", userId: "owner_1" });
    const { token } = await mintShareToken({
      eventId: "evt_1",
      createdById: "owner_1",
    });
    const stored = [...store.tokens.values()][0];
    const expectedHash = createHash("sha256").update(token).digest("hex");
    expect(stored.tokenHash).toBe(expectedHash);
    expect(stored.tokenHash).not.toBe(token);
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it("respects ttlDays override", async () => {
    seedEvent({ id: "evt_1", userId: "owner_1" });
    const before = Date.now();
    const result = await mintShareToken({
      eventId: "evt_1",
      createdById: "owner_1",
      ttlDays: 1,
    });
    // Allow ±2s wiggle for clock + execution drift.
    const oneDayMs = 24 * 60 * 60 * 1000;
    const elapsed = result.expiresAt.getTime() - before;
    expect(elapsed).toBeGreaterThan(oneDayMs - 2000);
    expect(elapsed).toBeLessThan(oneDayMs + 2000);
  });
});

describe("verifyShareToken", () => {
  it("happy path: returns ok with eventId and tokenId", async () => {
    seedEvent({ id: "evt_1", userId: "owner_1" });
    const { token } = await mintShareToken({
      eventId: "evt_1",
      createdById: "owner_1",
    });
    const verified = await verifyShareToken(token);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.eventId).toBe("evt_1");
      expect(verified.createdById).toBe("owner_1");
      expect(verified.tokenId).toBe("tok_1");
    }
  });

  it("returns not_found for unknown / garbage / empty input", async () => {
    expect(await verifyShareToken("nope")).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await verifyShareToken("")).toEqual({
      ok: false,
      reason: "not_found",
    });
    // @ts-expect-error: testing the runtime guard
    expect(await verifyShareToken(undefined)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("returns expired when expiresAt has passed", async () => {
    seedEvent({ id: "evt_1", userId: "owner_1" });
    const { token, tokenId } = await mintShareToken({
      eventId: "evt_1",
      createdById: "owner_1",
    });
    const row = store.tokens.get(tokenId)!;
    row.expiresAt = new Date(Date.now() - 1000);
    expect(await verifyShareToken(token)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("returns revoked when revokedAt is set", async () => {
    seedEvent({ id: "evt_1", userId: "owner_1" });
    const { token, tokenId } = await mintShareToken({
      eventId: "evt_1",
      createdById: "owner_1",
    });
    const row = store.tokens.get(tokenId)!;
    row.revokedAt = new Date();
    expect(await verifyShareToken(token)).toEqual({
      ok: false,
      reason: "revoked",
    });
  });
});

describe("markShareTokenUsed", () => {
  it("bumps lastUsedAt", async () => {
    seedEvent({ id: "evt_1", userId: "owner_1" });
    const { tokenId } = await mintShareToken({
      eventId: "evt_1",
      createdById: "owner_1",
    });
    expect(store.tokens.get(tokenId)?.lastUsedAt).toBeNull();
    await markShareTokenUsed(tokenId);
    const row = store.tokens.get(tokenId)!;
    expect(row.lastUsedAt).toBeInstanceOf(Date);
    expect(row.lastUsedAt!.getTime()).toBeGreaterThan(Date.now() - 5000);
  });
});

describe("revokeShareToken", () => {
  it("revokes when caller owns the event", async () => {
    seedEvent({ id: "evt_1", userId: "owner_1" });
    const { tokenId } = await mintShareToken({
      eventId: "evt_1",
      createdById: "owner_1",
    });
    const result = await revokeShareToken({
      tokenId,
      callerUserId: "owner_1",
    });
    expect(result).toEqual({ ok: true });
    expect(store.tokens.get(tokenId)?.revokedAt).toBeInstanceOf(Date);
  });

  it("rejects non-owner with forbidden", async () => {
    seedEvent({ id: "evt_1", userId: "owner_1" });
    const { tokenId } = await mintShareToken({
      eventId: "evt_1",
      createdById: "owner_1",
    });
    const result = await revokeShareToken({
      tokenId,
      callerUserId: "intruder",
    });
    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(store.tokens.get(tokenId)?.revokedAt).toBeNull();
  });

  it("returns not_found for missing tokenId", async () => {
    const result = await revokeShareToken({
      tokenId: "tok_nope",
      callerUserId: "owner_1",
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("is idempotent for already-revoked tokens", async () => {
    seedEvent({ id: "evt_1", userId: "owner_1" });
    const { tokenId } = await mintShareToken({
      eventId: "evt_1",
      createdById: "owner_1",
    });
    const first = await revokeShareToken({
      tokenId,
      callerUserId: "owner_1",
    });
    const firstRevokedAt = store.tokens.get(tokenId)!.revokedAt!;
    const second = await revokeShareToken({
      tokenId,
      callerUserId: "owner_1",
    });
    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    // The second call must NOT reset revokedAt (idempotency means the
    // original revoke timestamp is preserved for audit).
    expect(store.tokens.get(tokenId)!.revokedAt!.getTime()).toBe(
      firstRevokedAt.getTime(),
    );
  });
});

describe("buildShareUrl", () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = { ...originalEnv };
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses NEXTAUTH_URL as base when present", () => {
    process.env.NEXTAUTH_URL = "https://clara.example";
    expect(buildShareUrl("abc123", "es")).toBe(
      "https://clara.example/es/events/share/abc123",
    );
  });

  it("strips trailing slashes from the base URL", () => {
    process.env.NEXTAUTH_URL = "https://clara.example///";
    expect(buildShareUrl("abc123", "en")).toBe(
      "https://clara.example/en/events/share/abc123",
    );
  });

  it("falls back to VERCEL_URL when NEXTAUTH_URL is unset", () => {
    delete process.env.NEXTAUTH_URL;
    process.env.VERCEL_URL = "preview.example";
    expect(buildShareUrl("xyz", "en")).toBe(
      "https://preview.example/en/events/share/xyz",
    );
  });

  it("falls back to localhost when neither env is set", () => {
    delete process.env.NEXTAUTH_URL;
    delete process.env.VERCEL_URL;
    expect(buildShareUrl("xyz", "es")).toBe(
      "http://localhost:3000/es/events/share/xyz",
    );
  });
});
