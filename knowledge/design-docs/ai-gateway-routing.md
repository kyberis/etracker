# ai-gateway-routing

## Problem

Clara is chat-first and runs an agent loop with up to 8 tool-calling
steps per turn. We need:

- A single chokepoint for cost tracking, retries, and per-feature
  observability tags (`feature:chat-web`, `feature:chat-telegram`,
  `feature:system-nudge`).
- The ability to A/B a different model (or fall back to a healthier
  provider) without touching feature code.
- A self-host story: a developer with only an `OPENAI_API_KEY` or
  `AI_GATEWAY_API_KEY` should get a working agent (Gateway preferred).
- Voice features (Whisper STT, OpenAI TTS) routed through the **same**
  Vercel AI Gateway OpenAI-compatible host (`https://ai-gateway.vercel.sh/v1`).

## Decision

The agent calls **Vercel AI Gateway** when an `AI_GATEWAY_API_KEY` or
`VERCEL_OIDC_TOKEN` is set, falling back to `OPENAI_API_KEY` for direct
OpenAI-compatible calls through the same SDK paths.

**Whisper and TTS use the Gateway base URL** (`/v1/audio/transcriptions`,
`/v1/audio/speech`) with the same bearer token order as chat.

Models are **always** referenced as `provider/model` strings — the AI
SDK detects them and routes via the Gateway transparently. The chat
default is whatever `AI_MODEL` resolves to (currently
`openai/gpt-5.4`), with `OPENAI_MODEL` accepted as a legacy fallback
so older env files keep working.

Routing matrix:

| Use case | Provider path | Where in code |
|----------|---------------|---------------|
| Chat / agent loop (web) | `streamText({ model: gateway(DEFAULT_MODEL) })` | [`src/lib/ai/run-expense-agent.ts`](../../src/lib/ai/run-expense-agent.ts) — `streamExpenseAgent` |
| Chat / agent loop (Telegram) | `generateText({ model: gateway(DEFAULT_MODEL) })` | same file — `generateExpenseAgentReply` |
| System-initiated nudges (no tools) | `generateText({ model: gateway(DEFAULT_MODEL), tools: {}, stopWhen: stepCountIs(1) })` | same file — `generateSystemInitiatedReply` |
| Whisper (audio → text) | Vercel AI Gateway (`/v1/audio/transcriptions`) | [`src/lib/ai/transcribe-audio.ts`](../../src/lib/ai/transcribe-audio.ts) |
| TTS (text → audio) | Vercel AI Gateway (`/v1/audio/speech`) | [`src/lib/ai/text-to-speech.ts`](../../src/lib/ai/text-to-speech.ts) |
| Vision (extracting transactions from images / PDFs) | Through Gateway as part of the agent (`addMonthLine` path with image content blocks) | agent loop |

Per-call observability tags fed to the Gateway are mandatory:

- `feature:chat-web` or `feature:chat-telegram`.
- `locale:<es|en>`.
- `kind:guest` for guest event-wallet sessions (so cost is split out).
- `feature:system-nudge` + `kind:<SystemNudgeKind>` for any
  system-initiated message.

Step budget: **8** for the agent (`stopWhen: stepCountIs(8)`).
Retries: **6** (configurable up to 12 via `AI_CHAT_MAX_RETRIES`).

## Why this and not X

**Why not direct OpenAI for everything?** We lose Gateway's per-call
cost tracking, automatic retries, and the option to fail over to a
second model when one provider is degraded.

**Why route Whisper/TTS through Gateway as well?** One bearer token and one
observability surface for chat and voice; requests use the OpenAI-compatible
`/v1/audio/*` paths on `ai-gateway.vercel.sh`.

**Self-host:** Prefer `AI_GATEWAY_API_KEY`; legacy `OPENAI_API_KEY` still works
as a fallback (see [`gateway-auth.ts`](../../src/lib/ai/gateway-auth.ts)).

**Why not abstract the provider behind a custom interface?** The
Vercel AI SDK already does that. Wrapping the wrap is overhead.
`streamText({ model: gateway(...) })` falls back to direct OpenAI
when the Gateway token is missing — we get the fallback for free.

**Why split `streamExpenseAgent` vs `generateExpenseAgentReply` vs
`generateSystemInitiatedReply` instead of one function?** Each has
different invariants:

- Web stream needs `streamText` for `useChat` SSE.
- Telegram needs `generateText` because the webhook is one-shot.
- System-initiated nudges must NOT have tools (no chance for the
  model to mutate user data on a turn the user didn't initiate) and
  must NOT count against the agent quota.

Forcing them into one function hides these differences and invites
bugs (a future contributor calls "the agent" from a cron and
accidentally bills the user / lets the model write).

## How to follow it

When **adding a new chat / classification call**:

```ts
import { generateText, gateway } from "ai";

const result = await generateText({
  model: gateway(process.env.AI_MODEL ?? "openai/gpt-5.4"),
  providerOptions: {
    gateway: {
      user: userId,
      tags: [`feature:<name>`, `locale:${locale}`],
    },
  },
  system: "...",
  messages: [...],
});
```

Always pass `providerOptions.gateway.user = userId` and at least one
`feature:` tag. They drive the per-feature cost dashboards.

When **adding a new audio / speech call**:

- Use [`resolveGatewayApiKeyFromEnv`](../../src/lib/ai/gateway-auth.ts) +
  `${VERCEL_AI_GATEWAY_BASE}/audio/...` (see transcribe + TTS modules).
- Vision (image content blocks inside an agent turn) → goes through
  the Gateway as part of the agent message; no separate code path.

When **adding a system-initiated outbound message**:

- Use `generateSystemInitiatedReply` — it enforces `tools: {}`, a
  1-step budget, no quota check, and the right `feature:system-nudge`
  tag.
- Add a new `SystemNudgeKind` literal in
  [`src/lib/ai/run-expense-agent.ts`](../../src/lib/ai/run-expense-agent.ts).
- See [`.cursor/skills/automated-user-comms/SKILL.md`](../../.cursor/skills/automated-user-comms/SKILL.md)
  for the safety rules around what to put in the prompt.

When **changing the default model**:

- Update `AI_MODEL` env in production / preview.
- Verify cost in the Gateway dashboard for the new model before
  flipping all users.
- Bump the relevant CHANGELOG entry only if the change is
  user-noticeable (different reply quality, different latency
  envelope).

## How to enforce it

- New code that imports `openai` directly for chat (not Whisper /
  TTS) is flagged in code review.
- Tests for agent / classification helpers should mock `generateText`
  / `streamText` at the module boundary, not the underlying
  `openai` client, so the abstraction stays.
- Every call into the Gateway must carry a `feature:` tag — review
  catches missing tags.

## Open questions

- We don't yet expose per-user model choice. Pro / paid tiers might
  want it later; for now it's an env knob.
- The Gateway also supports image generation; we don't use it yet.
  When we do, route it through the Gateway by default.
- Cost tracking via Gateway is per-deployment, not per-user (it has
  per-user tags but not per-user invoicing). For per-user accounting
  we rely on `AgentMessageUsage.inputTokens` / `outputTokens`
  rollups.

## Related

- [`core-beliefs`](core-beliefs.md) — "AI uses the Gateway when it
  can".
- [`.cursor/skills/engineer-integrations/SKILL.md`](../../.cursor/skills/engineer-integrations/SKILL.md)
- [`.cursor/skills/automated-user-comms/SKILL.md`](../../.cursor/skills/automated-user-comms/SKILL.md)
- Spec: [`ai-agent`](../product-specs/ai-agent.md).
