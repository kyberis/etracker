---
name: engineer-integrations
description: Owns Clara's integrations with the outside world — Vercel AI Gateway / AI SDK 6, OpenAI Whisper + TTS, Telegram Bot API, Vercel Blob, Vercel Runtime Cache, and the public + per-user MCP servers. Use when adding or modifying any third-party API call, AI tool, MCP tool, webhook handler, or model selection.
---

# Integrations Engineer — Clara

## Mission

Clara is a thin shell around several external services. The job here is to keep
each integration: configurable via env, **gracefully degrading** when its env
is missing, validated at the boundary with Zod, and isolated behind a single
provider module so the rest of the codebase doesn't know which vendor we're
talking to.

## Inventory

| Capability | Provider | Module |
|------------|----------|--------|
| Chat agent / classifier | Vercel AI SDK 6 via Vercel AI Gateway | [`src/lib/ai/`](../../../src/lib/ai) |
| Audio transcription | OpenAI Whisper | `src/lib/ai/...` (transcription helpers) |
| Audio TTS | OpenAI TTS + Vercel Blob storage | `src/lib/ai/...`, [`src/lib/blob/`](../../../src/lib/blob) |
| Telegram inbound/outbound | Telegram Bot API | [`src/lib/telegram/`](../../../src/lib/telegram) |
| Runtime cache | Vercel Runtime Cache | [`src/lib/cache/`](../../../src/lib/cache), `src/lib/year-timeline-data.ts` |
| Rate limiting | Upstash Redis | [`src/lib/rate-limit.ts`](../../../src/lib/rate-limit.ts) |
| Error reporting | Sentry (optional, via `SENTRY_DSN`) | [`src/lib/log.ts`](../../../src/lib/log.ts) forwards |
| MCP transport | `@modelcontextprotocol/sdk` + `mcp-handler` | [`src/lib/mcp/`](../../../src/lib/mcp), `src/app/api/mcp/**` |

## Vercel AI Gateway (chat + classification)

- **Always** route chat and classification through the Gateway. Reference
  models as `provider/model` strings and read from env:
  - `AI_MODEL` — main chat model (default `openai/gpt-5.4`).
  - `AI_CLASSIFIER_MODEL` — classifier (default `openai/gpt-4.1-mini`).
- Auth: `VERCEL_OIDC_TOKEN` (auto-provisioned by `vercel env pull`, rotates
  ~12h) is preferred. `AI_GATEWAY_API_KEY` is the fallback for CI / non-Vercel
  environments.
- Direct `OPENAI_API_KEY` calls are **only** for OpenAI-only products that
  don't go through the Gateway: Whisper transcription and TTS. Do not use it
  for chat.
- All agent prompts live near the agent loop in `src/lib/ai/`. Prompt edits
  are user-visible — see [`ux-writer`](../ux-writer/SKILL.md) and run the
  agent locally before pushing.

## Tools the agent can call

The agent's tool catalog is the surface area for "Clara changing your data".

- Tools live in `src/lib/ai/` (next to the agent loop).
- Every tool input is a Zod schema; every tool output is a JSON-serialisable
  object.
- Mutating tools (mark as paid, add expense, …) **must** ask for user
  confirmation in the chat reply before performing the change. The
  approval-before-write contract is core voice + safety. See
  [`ux-writer`](../ux-writer/SKILL.md).
- Tools must be pure wrappers around services; no business logic lives only
  in a tool.

## MCP servers

Two surfaces:

### Public — `/api/mcp`

- No auth. Exposes documentation (features, FAQ, changelog, privacy) as MCP
  resources, tools, and prompts. Useful so external AI clients can answer
  questions about Clara herself.
- Source: `src/lib/mcp/public-server.ts` and the route under
  `src/app/api/mcp/`.
- Discovery: `src/app/.well-known/mcp.json/route.ts`.

### Per-user — `/api/mcp/user`

- Bearer-token auth (`Authorization: Bearer ada_pat_...`). PATs created from
  Settings; sha-256 hashed at rest; expirable; revocable.
- Exposes user-scoped tools (`getProfile`, `listMonths`, `getMonth`,
  `markLinePaid`, `addExpenseTemplate`, …).
- Every tool is a thin wrapper over a service / DB function; never a
  duplicate of business logic.
- Rate limited via Upstash. Adding a new tool requires:
  1. A spec entry in `knowledge/product-specs/mcp-per-user.md` (when it
     exists) describing inputs / outputs / side effects.
  2. A privacy review trigger via [`legal-advisor`](../legal-advisor/SKILL.md)
     because it expands what an external AI client can do with user data.

## Telegram Bot API

- Inbound webhook validates the secret token in the
  `X-Telegram-Bot-Api-Secret-Token` header. Outbound via Telegram Bot REST.
- Voice messages are downloaded, transcribed via OpenAI Whisper, then
  handed to the agent like any other user message.
- Pairing uses HMAC-signed deep-link tokens (`?start=<token>`). The user
  generates the token from Settings → Integrations and taps Start in the
  bot. Implementation: `src/lib/telegram/`.

## Graceful degradation (mandatory)

Every optional integration must degrade gracefully when its env is missing:

- **AI Gateway missing**: chat features show "AI no está configurada" and
  the rest of the app keeps working.
- **Telegram missing**: pairing UI is hidden; webhook returns 200 but
  no-op.
- **Vercel Blob missing**: TTS replies fall back to text-only.
- **Upstash missing**: rate limiter no-ops in dev; production should always
  have it.
- **Sentry missing**: `log.error()` writes to console only.

## Environment vars (single source of truth)

`.env.example` is the source of truth. Any new var must:

1. Be added to `.env.example` with a comment explaining what it does.
2. Be read once in a single provider module and exported as a typed value.
3. Have a "missing" path that degrades gracefully (see above).

## Webhook hygiene

- Verify signatures **first**, then parse with Zod, then do work.
- Idempotent by design — webhooks retry. Use a webhook event id (when the
  provider gives one) to short-circuit duplicates.
- Return 2xx fast; offload heavy work to a background job or follow-up
  request.

## Checklist

```
Integration change checklist
- [ ] New env var added to .env.example with a comment
- [ ] Provider module is the only file that touches the SDK
- [ ] Zod schema validates the provider response shape
- [ ] Missing-env path degrades gracefully (no 500s)
- [ ] withApi() returns a typed error code for known failure modes
- [ ] Webhook signature verified before any work
- [ ] If MCP user-tool added: privacy-impact noted, rate limit applies
- [ ] Knowledge spec updated (or created)
```

## Coordination

- Voice / copy of agent replies and tool descriptions:
  [`ux-writer`](../ux-writer/SKILL.md).
- New data fields persisted from a provider response:
  [`engineer-data`](../engineer-data/SKILL.md).
- Privacy review triggers: [`legal-advisor`](../legal-advisor/SKILL.md).
- Telegram / voice pipeline copy + cadence:
  [`automated-user-comms`](../automated-user-comms/SKILL.md).
