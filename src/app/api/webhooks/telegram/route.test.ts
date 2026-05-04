/**
 * Integration test for the Telegram webhook focused on the AI-driven
 * first-run setup flow. We mock the deeper services (db, telegram client,
 * agent, agent-quota, setup-state) and assert that:
 *
 *   - When `loadTelegramSetupHint` returns `needsSetup=true`, the link
 *     completion path skips the static `welcomeLinked` and invokes the
 *     agent with the setup hint.
 *   - When `needsSetup=false`, the link completion path uses the existing
 *     static welcome + inline keyboard (no agent call).
 *   - For follow-up messages from a linked user, the agent always receives
 *     the current setup hint.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TELEGRAM_SETUP_KICKOFF_TOKEN,
  getTelegramStrings,
} from "@/lib/telegram/menu";

const lazyDb = vi.hoisted(() => ({ db: {} as Record<string, unknown> }));
vi.mock("@/lib/db", () => ({ db: lazyDb.db }));

const lazyClient = vi.hoisted(() => ({
  sendTelegramMessage: vi.fn(async () => {}),
  sendChatAction: vi.fn(async () => {}),
  sendTelegramChartsThenHtmlMessage: vi.fn(async () => {}),
  // v0.12.0 added a "live tool progress" status message: webhook posts a
  // small status, edits it as each tool runs, then deletes it before the
  // final reply. The mocks return undefined for the status (route is
  // permissive about a missing status message — it just skips the edit /
  // delete branches).
  sendTelegramStatusMessage: vi.fn(async () => undefined),
  editTelegramMessage: vi.fn(async () => {}),
  deleteTelegramMessage: vi.fn(async () => {}),
  getTelegramFileUrl: vi.fn(async () => null),
  downloadTelegramFile: vi.fn(async () => null),
  verifyTelegramWebhookRequest: vi.fn(() => true),
}));
vi.mock("@/lib/telegram/client", () => lazyClient);

const lazySetupState = vi.hoisted(() => ({
  loadTelegramSetupHint: vi.fn(),
}));
vi.mock("@/lib/telegram/setup-state", () => ({
  loadTelegramSetupHint: lazySetupState.loadTelegramSetupHint,
}));

const lazyAgent = vi.hoisted(() => ({
  generateExpenseAgentReply: vi.fn(),
}));
vi.mock("@/lib/ai/run-expense-agent", () => lazyAgent);

const lazyQuota = vi.hoisted(() => ({
  consumeAgentQuota: vi.fn(async () => ({
    ok: true as const,
    used: 1,
    limit: 100,
    remaining: 99,
    resetAtUtc: "2026-01-01T00:00:00Z",
  })),
  recordAgentTokens: vi.fn(async () => {}),
  recordAgentModelUsage: vi.fn(async () => {}),
}));
vi.mock("@/lib/agent-quota", () => lazyQuota);

vi.mock("@/lib/ai/transcribe-audio", () => ({
  transcribeAudioOpenAI: vi.fn(async () => ({ ok: false, message: "n/a" })),
}));

vi.mock("@/lib/log", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/** Minimal in-memory state for db calls used by the routes under test. */
type FakeUser = {
  id: string;
  locale: string;
  telegramLinkCode: string | null;
  telegramLinkCodeExpires: Date | null;
  telegramUserId: bigint | null;
};

type FakeEventParticipant = {
  userId: string;
  eventId: string;
  displayName: string;
  removedAt: Date | null;
  event: {
    name: string;
    user: { name: string | null; email: string };
  };
};

const state = {
  users: new Map<string, FakeUser>(),
  telegramMessages: [] as Array<{
    userId: string;
    role: string;
    text: string;
    chatId: bigint;
    isGroup: boolean;
    createdAt: Date;
  }>,
  /** Keyed by `telegramLinkCode`. */
  eventParticipants: new Map<string, FakeEventParticipant>(),
};

function installDbStub() {
  Object.assign(lazyDb.db, {
    user: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        for (const u of state.users.values()) {
          const codeMatches =
            typeof where.telegramLinkCode === "string" &&
            u.telegramLinkCode === where.telegramLinkCode;
          if (codeMatches && u.telegramLinkCodeExpires) {
            if (u.telegramLinkCodeExpires.getTime() > Date.now()) {
              return { id: u.id };
            }
          }
        }
        return null;
      },
      findUnique: async ({
        where,
      }: {
        where: { id?: string; telegramUserId?: bigint };
        select?: Record<string, true>;
      }) => {
        let user: FakeUser | undefined;
        if (where.id) user = state.users.get(where.id);
        else if (where.telegramUserId) {
          for (const u of state.users.values()) {
            if (u.telegramUserId === where.telegramUserId) {
              user = u;
              break;
            }
          }
        }
        return user ?? null;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const u = state.users.get(where.id);
        if (!u) throw new Error("user not found");
        if ("telegramUserId" in data) {
          u.telegramUserId = data.telegramUserId as bigint | null;
        }
        if ("telegramLinkCode" in data) {
          u.telegramLinkCode = data.telegramLinkCode as string | null;
        }
        if ("telegramLinkCodeExpires" in data) {
          u.telegramLinkCodeExpires = data.telegramLinkCodeExpires as Date | null;
        }
        return u;
      },
    },
    telegramMessage: {
      findMany: async () => state.telegramMessages.slice(),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.telegramMessages.push({
          userId: data.userId as string,
          role: data.role as string,
          text: data.text as string,
          chatId: data.chatId as bigint,
          isGroup: data.isGroup as boolean,
          createdAt: new Date(),
        });
        return data;
      },
    },
    // The shared-event-wallets refactor added a participant link-code
    // lookup BEFORE the legacy user link-code lookup. None of the
    // existing tests use the participant path, so always return null
    // and let the legacy branch run.
    eventParticipant: {
      findUnique: async ({
        where,
      }: {
        where: { telegramLinkCode?: string; eventId_userId?: unknown };
      }) => {
        if (where.telegramLinkCode) {
          return state.eventParticipants.get(where.telegramLinkCode) ?? null;
        }
        return null;
      },
      update: async () => ({}),
    },
    $transaction: async (
      ops: Array<unknown> | ((tx: unknown) => Promise<unknown>),
    ) => {
      // Both call shapes used by the route: array-of-promises and
      // function. Each is a no-op against our state but we await so
      // the test surface mirrors prod behaviour.
      if (typeof ops === "function") return ops(lazyDb.db);
      return Promise.all(ops);
    },
  });
}

beforeEach(() => {
  state.users.clear();
  state.telegramMessages.length = 0;
  state.eventParticipants.clear();
  installDbStub();
  process.env.TELEGRAM_WEBHOOK_SECRET = "test-secret";
  lazyClient.sendTelegramMessage.mockClear();
  lazyClient.sendTelegramChartsThenHtmlMessage.mockClear();
  lazyClient.sendChatAction.mockClear();
  lazyClient.verifyTelegramWebhookRequest.mockReturnValue(true);
  lazySetupState.loadTelegramSetupHint.mockReset();
  lazyAgent.generateExpenseAgentReply.mockReset();
  lazyAgent.generateExpenseAgentReply.mockResolvedValue({
    text: "AI welcome",
    chartImageUrls: [],
    usage: { inputTokens: 1, outputTokens: 1 },
    model: "openai/test",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function buildStartUpdate(code: string, userId = 9001) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 555, type: "private" as const },
      from: {
        id: userId,
        is_bot: false,
        username: "alice",
        language_code: "es",
      },
      text: `/start ${code}`,
    },
  };
}

async function postUpdate(payload: unknown) {
  // Import lazily so module-level mocks are wired before evaluation.
  const { POST } = await import("./route");
  const request = new Request("https://example.test/api/webhooks/telegram", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": "test-secret",
    },
    body: JSON.stringify(payload),
  });
  return POST(request);
}

describe("Telegram webhook — first-run AI setup", () => {
  it("invokes the agent with setupHint when the linked account needs setup", async () => {
    state.users.set("user-a", {
      id: "user-a",
      locale: "es",
      telegramLinkCode: "code-needs-setup",
      telegramLinkCodeExpires: new Date(Date.now() + 60_000),
      telegramUserId: null,
    });
    lazySetupState.loadTelegramSetupHint.mockResolvedValue({
      needsSetup: true,
      currencyConfirmed: false,
      hasIncomeThisMonth: false,
      hasExpenseThisMonth: false,
      primaryCurrency: "USD",
      locale: "es",
    });

    const response = await postUpdate(buildStartUpdate("code-needs-setup"));
    expect(response.status).toBe(200);

    expect(lazyAgent.generateExpenseAgentReply).toHaveBeenCalledTimes(1);
    const callArgs = lazyAgent.generateExpenseAgentReply.mock.calls[0][0];
    expect(callArgs.userId).toBe("user-a");
    expect(callArgs.source).toBe("telegram");
    expect(callArgs.setupHint?.needsSetup).toBe(true);
    expect(callArgs.messages.at(-1)).toMatchObject({
      role: "user",
      content: TELEGRAM_SETUP_KICKOFF_TOKEN,
    });

    const welcomeLinked = getTelegramStrings("es").welcomeLinked;
    const sentTexts = lazyClient.sendTelegramMessage.mock.calls.map(
      (c: unknown[]) => c[1],
    );
    expect(sentTexts).not.toContain(welcomeLinked);
  });

  it("uses the static welcome and skips the agent when the account is already set up", async () => {
    state.users.set("user-b", {
      id: "user-b",
      locale: "es",
      telegramLinkCode: "code-ready",
      telegramLinkCodeExpires: new Date(Date.now() + 60_000),
      telegramUserId: null,
    });
    lazySetupState.loadTelegramSetupHint.mockResolvedValue({
      needsSetup: false,
      currencyConfirmed: true,
      hasIncomeThisMonth: true,
      hasExpenseThisMonth: false,
      primaryCurrency: "ARS",
      locale: "es",
    });

    const response = await postUpdate(buildStartUpdate("code-ready"));
    expect(response.status).toBe(200);

    expect(lazyAgent.generateExpenseAgentReply).not.toHaveBeenCalled();
    const welcomeLinked = getTelegramStrings("es").welcomeLinked;
    const sentTexts = lazyClient.sendTelegramMessage.mock.calls.map(
      (c: unknown[]) => c[1],
    );
    expect(sentTexts).toContain(welcomeLinked);
  });

  it("falls back to the static welcome when the kickoff dispatch throws", async () => {
    state.users.set("user-c", {
      id: "user-c",
      locale: "es",
      telegramLinkCode: "code-kaboom",
      telegramLinkCodeExpires: new Date(Date.now() + 60_000),
      telegramUserId: null,
    });
    lazySetupState.loadTelegramSetupHint.mockResolvedValue({
      needsSetup: true,
      currencyConfirmed: false,
      hasIncomeThisMonth: false,
      hasExpenseThisMonth: false,
      primaryCurrency: "USD",
      locale: "es",
    });
    // Force the kickoff dispatch to crash before it can send anything by
    // having the quota lookup reject. `completeTelegramLink` should catch
    // and recover with the static welcome so the user is never left silent.
    lazyQuota.consumeAgentQuota.mockRejectedValueOnce(new Error("db down"));

    const response = await postUpdate(buildStartUpdate("code-kaboom"));
    expect(response.status).toBe(200);

    const welcomeLinked = getTelegramStrings("es").welcomeLinked;
    const sentTexts = lazyClient.sendTelegramMessage.mock.calls.map(
      (c: unknown[]) => c[1],
    );
    expect(sentTexts).toContain(welcomeLinked);
  });

  it("links a fresh GUEST via EventParticipant.telegramLinkCode and sends the event-aware welcome", async () => {
    // GUEST user (User.kind === "GUEST") was created by the share
    // landing accept handler. They receive a t.me/<bot>?start=<code>
    // deep-link which the webhook resolves via EventParticipant.
    state.users.set("guest-user", {
      id: "guest-user",
      locale: "es",
      telegramLinkCode: null,
      telegramLinkCodeExpires: null,
      telegramUserId: null,
    });
    // The mock `db.user.findUnique` reads from `state.users`. We need
    // to expose `kind` on the read so the route picks the GUEST
    // welcome variant.
    (state.users.get("guest-user") as unknown as { kind: string }).kind =
      "GUEST";
    state.eventParticipants.set("ep-code-1", {
      userId: "guest-user",
      eventId: "evt_1",
      displayName: "Marina",
      removedAt: null,
      event: {
        name: "Mendoza Trip",
        user: { name: "Marcos", email: "marcos@example.com" },
      },
    });

    const response = await postUpdate(buildStartUpdate("ep-code-1"));
    expect(response.status).toBe(200);

    // No agent kickoff for guests — the welcome is static and
    // event-aware, not the onboarding flow.
    expect(lazyAgent.generateExpenseAgentReply).not.toHaveBeenCalled();
    const sentTexts = lazyClient.sendTelegramMessage.mock.calls.map(
      (c: unknown[]) => c[1],
    );
    // The welcome string is taken from `event-share-strings.ts` and
    // mentions both the event name and the owner's display name.
    expect(sentTexts.some((t: unknown) => typeof t === "string" && t.includes("Mendoza Trip"))).toBe(true);
    expect(sentTexts.some((t: unknown) => typeof t === "string" && t.includes("Marcos"))).toBe(true);
  });

  it("forwards setupHint on follow-up messages from a linked user", async () => {
    state.users.set("user-d", {
      id: "user-d",
      locale: "es",
      telegramLinkCode: null,
      telegramLinkCodeExpires: null,
      telegramUserId: BigInt(8888),
    });
    lazySetupState.loadTelegramSetupHint.mockResolvedValue({
      needsSetup: true,
      currencyConfirmed: false,
      hasIncomeThisMonth: false,
      hasExpenseThisMonth: false,
      primaryCurrency: "USD",
      locale: "es",
    });

    const update = {
      update_id: 2,
      message: {
        message_id: 2,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 555, type: "private" as const },
        from: {
          id: 8888,
          is_bot: false,
          username: "alice",
          language_code: "es",
        },
        text: "Quiero arrancar",
      },
    };
    const response = await postUpdate(update);
    expect(response.status).toBe(200);

    expect(lazyAgent.generateExpenseAgentReply).toHaveBeenCalledTimes(1);
    const callArgs = lazyAgent.generateExpenseAgentReply.mock.calls[0][0];
    expect(callArgs.setupHint?.needsSetup).toBe(true);
    expect(callArgs.messages.at(-1)).toMatchObject({
      role: "user",
      content: "Quiero arrancar",
    });
  });
});
