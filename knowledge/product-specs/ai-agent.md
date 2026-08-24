# ai-agent

> Clara's chat-first AI agent: one tool registry, two conversational
> surfaces (web stream + Telegram one-shot), one tool-less proactive
> reply for system-initiated nudges. Speaks Spanish (rioplatense) and
> English. Up to 24 tool steps per turn (bulk imports use `addMonthLines`).

## What it does

When the user chats with Clara (web `/app/chat` or Telegram), Clara:

1. Loads the user's context (`primaryCurrency`,
   `primaryCurrencyConfirmedAt`, `locale`,
   `expenseImportInstructions`, `kind`).
2. Builds a per-locale system prompt with product rules (months,
   templates, banks, savings, events, FX, response style, default
   "paid" semantics). **Saved import/categorisation hints**
   (`expenseImportInstructions`) are **not** embedded in the system string;
   they are sent as a separate synthetic `user` message delimited by
   `<<<USER_SAVED_IMPORT_PREFERENCES>>>` / `<<<END_USER_SAVED_IMPORT_PREFERENCES>>>`
   so they cannot override the canonical system instructions. The system
   prompt includes an explicit prompt-safety block for adversarial pasted
   imports and screenshots.
3. Streams or generates a reply, allowing up to 24 tool-calling steps.
4. Logs every step (request, per-step tool calls + results, finish)
   with a `traceId` for cost / behaviour analysis.
5. For Telegram: edits a "thinking → working" status message in
   place via the `onStep` callback so the user sees motion.
6. For web: streams via `useChat` SSE; the route records token usage
   on `onFinish`.

## Where the code lives

| Layer | Path |
|-------|------|
| Agent loop (3 entrypoints) | [`src/lib/ai/run-expense-agent.ts`](../../src/lib/ai/run-expense-agent.ts) |
| Tool registry (~45 tools) | [`src/lib/ai/expense-tools.ts`](../../src/lib/ai/expense-tools.ts) |
| Per-tool tests | [`src/lib/ai/expense-tools.test.ts`](../../src/lib/ai/expense-tools.test.ts), [`src/lib/ai/expense-tools-shared.test.ts`](../../src/lib/ai/expense-tools-shared.test.ts) |
| AI logger + trace ids | [`src/lib/ai/logger.ts`](../../src/lib/ai/logger.ts) |
| Cost computation | [`src/lib/ai/cost.ts`](../../src/lib/ai/cost.ts) |
| Chart spec → QuickChart URL | [`src/lib/messaging/chart-quickchart-url.ts`](../../src/lib/messaging/chart-quickchart-url.ts) |
| Web chat route | [`src/app/api/chat/`](../../src/app/api/chat) |
| Telegram webhook | [`src/app/api/webhooks/telegram/`](../../src/app/api/webhooks/telegram) |
| Quota enforcement | [`src/lib/agent-quota.ts`](../../src/lib/agent-quota.ts) |

## Data model

The agent itself is stateless per turn. It reads / writes via tools:

- `User.primaryCurrency`, `primaryCurrencyConfirmedAt`,
  `expenseImportInstructions`, `locale`, `kind`,
  `dailyAgentMessageLimit`.
- `Bank` (CRUD via tools).
- `Expense` (recurring template) and `MonthExpenseLine` (per-month
  materialisation).
- `Income` template + `MonthIncomeLine`.
- `MonthRecord` + `MonthIncomeLine` (months are lazy-created via
  `createMonthIfNeeded`).
- `SavingsMovement` (immutable ledger; see `savings` spec).
- `Event` + `EventParticipant` + `EventShareLink` (event wallets).
- `AgentMessageUsage` (rolled up by the webhook / chat route, not by
  the agent itself).

## Contracts

### Three entrypoints

`streamExpenseAgent({ userId, messages, source, responseStyle,
activeMonth, onFinish })`:

- Used by `/api/chat` for the web `useChat` SSE stream.
- Returns the AI SDK `streamText` result. Caller pipes it back to the
  client.
- `onFinish({ usage, text, model })` records `inputTokens` /
  `outputTokens` against the user.

`generateExpenseAgentReply({ userId, messages, source, responseStyle,
setupHint, guestEventScope, onStep })`:

- Used by the Telegram webhook (one-shot generate, not stream).
- Returns `{ text, chartImageUrls, usage, model }`.
- `chartImageUrls` are HTTPS PNG URLs synthesised from any
  `renderChart` tool calls in the agent's steps so Telegram can send
  them as photos.
- `setupHint` injects a Telegram first-run setup block when
  `needsSetup === true`.
- `guestEventScope` REPLACES the system prompt with a tightly scoped
  one for guest event-wallet users.

`generateSystemInitiatedReply({ userId, locale, kind, prompt })`:

- Used by the daily Telegram nudge cron and any future
  system-initiated outbound.
- **Tool-less** (`tools: {}`, `stopWhen: stepCountIs(1)`). The model
  cannot mutate or read DB state.
- **No quota check** — the user did not initiate this turn.
- Returns `{ text, usage, model }`. Caller handles delivery
  (Telegram, email, push).
- See [`automated-user-comms`](../../.cursor/skills/automated-user-comms/SKILL.md)
  for the safety rules that govern these prompts.

### Tool catalogue (web + Telegram, ~45 tools)

Grouped by domain:

| Domain | Tools |
|--------|-------|
| Months / state | `getMonthState`, `createMonthIfNeeded`, `mergePendingTemplates`, `applyPrevMonthLeftover` |
| Banks | `listBanks`, `createBank`, `updateBank`, `deleteBank` |
| Expense templates | `listExpenseTemplates`, `createExpenseTemplate`, `updateExpenseTemplate`, `deleteExpenseTemplate` |
| Month expense lines | `addMonthLine`, `updateMonthLine`, `deleteMonthLine` |
| Income templates | `listIncomeTemplates`, `createIncomeTemplate`, `updateIncomeTemplate`, `deleteIncomeTemplate` |
| Income lines | `addIncomeLine`, `updateIncomeLine`, `deleteIncomeLine` |
| Savings | `getSavingsState`, `addSavingsMovement`, `deleteSavingsMovement`, `dedupeSavingsMovements`, `setMonthlySavingsContribution`, `removeMonthlySavingsContribution` |
| Events | `listEvents`, `getActiveEvents`, `getEvent`, `createEvent`, `updateEvent`, `closeEvent`, `reopenEvent`, `deleteEvent`, `createEventShareLink`, `attachLineToEvent`, `detachLineFromEvent`, `listEventParticipants` |
| FX & preferences | `getFxRate`, `setPrimaryCurrency`, `setUserLocale`, `updateExpenseImportInstructions` |
| Charts | `renderChart` |

Step budget: **24** (`stopWhen: stepCountIs(24)`). Retries: **6**
(env override `AI_CHAT_MAX_RETRIES`, capped 4–12). Default model:
`AI_MODEL` env (currently `openai/gpt-5.4`). See
[`ai-gateway-routing`](../design-docs/ai-gateway-routing.md).

### Guest scope

When the agent is invoked for a `UserKind.GUEST` user with a
`guestEventScope`, the system prompt is **replaced** with a guest-only
variant ([`guestEventScopePrompt`](../../src/lib/ai/run-expense-agent.ts)),
and the tool registry is filtered (`buildExpenseTools(userId, {
userKind, scopedEventId })`) so the agent can only operate on the one
event. Anything else is gently declined.

## Invariants

- **All tools are bound to one user.** `buildExpenseTools(userId)`
  closes over the id; the model literally cannot pass a different one.
- **Tool descriptions are written in the user's locale** because the
  agent prompt itself is locale-specific. Tool *parameter* schemas
  remain English so the model's tool selection is robust.
- **`onStep` errors are non-fatal.** Telegram's status message UX must
  never break the agent loop.
- **System-initiated calls have NO tools.** This is enforced by the
  function signature of `generateSystemInitiatedReply`. Don't add a
  bypass.
- **Quota is checked BEFORE `streamExpenseAgent` /
  `generateExpenseAgentReply` runs.** Saves cost on refusal and
  prevents the model acknowledging a request it can't fulfil.
- **Tokens are recorded AFTER the agent returns.** Web stream:
  `onFinish` callback. Telegram: webhook calls
  `recordAgentTokens` with the returned `usage`.
- **Charts use `renderChart` only AFTER fetching real data.** The
  prompt enforces "never with invented numbers".
- **System prompts forbid financial advice.** Clara categorises and
  remembers; she does not tell the user what to do.
- **Currency confirmation gate.** When
  `primaryCurrencyConfirmedAt === null`, the agent is instructed to
  ask the user once and call `setPrimaryCurrency` before any
  amount-handling tool runs.

## Known gaps / TODOs

- The tool registry is a single 2.5kLOC file. A future refactor
  (one module per domain) would help review and per-tool testing,
  but blocks behind a careful migration to keep behaviour identical.
- `generateSystemInitiatedReply` only supports `telegram_daily_nudge`
  today. Add other `SystemNudgeKind` literals when the next
  system-initiated channel ships.
- Per-tool authorisation lives at the boundary of each tool body
  (each one re-checks ownership). A more uniform "tool guard"
  middleware could de-duplicate this.
- We don't expose tool calls / results to the user in the web UI yet
  (Telegram has the live status message; the web stream just shows
  the final text).
- We log every step with a structured logger; we don't yet ship logs
  to a remote sink. Add when scale demands.

## Related

- Design doc: [`ai-gateway-routing`](../design-docs/ai-gateway-routing.md)
- Design doc: [`with-api-error-handling`](../design-docs/with-api-error-handling.md)
- Skill: [`engineer-integrations`](../../.cursor/skills/engineer-integrations/SKILL.md)
- Skill: [`automated-user-comms`](../../.cursor/skills/automated-user-comms/SKILL.md)
- Spec: [`telegram`](telegram.md)
- Spec: [`mcp-per-user`](mcp-per-user.md) — exposes (a subset of)
  the same tool surface to external MCP clients via PAT auth.
