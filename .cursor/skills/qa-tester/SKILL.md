---
name: qa-tester
description: Test strategy and quality gates for Clara — Vitest-only suite (no Playwright, no theme matrix, no Capacitor). Owns the manual + automated regression posture, with emphasis on agent tools, MCP, validators, SEO surfaces, and i18n leak prevention. Use when planning tests, writing tests, validating regressions, or preparing release confidence.
---

# QA Tester — Clara

## Mission

Keep Clara honest. The product is a chat-first AI agent that touches users'
money story — so the test suite is biased toward **the parts where a
hallucination, a stale prompt, or a missed validation would silently mislead
a user**. Style coverage matters less; correctness of agent tools, MCP
contracts, and i18n hygiene matters most.

## Test stack

- **Unit + integration**: [Vitest](https://vitest.dev) only.
  - Config: [`vitest.config.ts`](../../../vitest.config.ts).
  - Pattern: `src/**/*.{test,spec}.{ts,tsx}`.
  - Environment: `node` (the suite is library + helper focused, not
    component-rendering focused).
  - Coverage provider: `v8`. Report excludes `src/app/**`, `src/components/**`,
    `src/types/**` by design — UI is exercised manually; logic must carry the
    coverage signal.
- **No Playwright / no e2e/**. Clara does not have a browser-driven suite
  today, and we're not adding one in this skill — see "Why no E2E" below.
- **CI**: `.github/workflows/ci.yml` runs `npm run lint && npx tsc --noEmit
  && npm test && npm run build` on every push/PR.

### Why no E2E

Clara is small and the chat agent + MCP + voice surfaces are awkward to drive
through Playwright. The investment-to-signal ratio is poor today. If we ever
add a critical user-visible flow that's hard to verify any other way, an E2E
suite under `e2e/` is the right answer — but until then, push effort into
unit tests of the agent loop and tool contracts.

## What to test (and how)

| Surface | Why it matters | Reference test |
|---------|----------------|----------------|
| **Agent tools** (`src/lib/ai/`) | Tools mutate user data through the agent loop. Schemas, side effects, and output shape must be locked down. | [`src/lib/ai/expense-tools.test.ts`](../../../src/lib/ai/expense-tools.test.ts) |
| **AI cost / model selection** (`src/lib/ai/`) | Provider routing has subtle env-var fallbacks that drift silently. | [`src/lib/ai/cost.test.ts`](../../../src/lib/ai/cost.test.ts) |
| **MCP servers** (`src/lib/mcp/`) | Public + per-user MCP are external-facing contracts. Tool descriptions, schemas, and discovery payloads are part of the API. | [`src/lib/mcp/public-server.test.ts`](../../../src/lib/mcp/public-server.test.ts) |
| **Validators** (`src/lib/validators.ts`) | Boundary parsing keeps Prisma honest. | [`src/lib/validators.test.ts`](../../../src/lib/validators.test.ts) |
| **Telegram pipeline** (`src/lib/telegram/`) | Bot-API secret token, deep-link tokens, voice ingest. | [`src/lib/telegram/`](../../../src/lib/telegram) |
| **API tokens** (`src/lib/api-token.ts`) | MCP PAT lifecycle is security-critical. | [`src/lib/api-token.test.ts`](../../../src/lib/api-token.test.ts) |
| **Months math** (`src/lib/months.ts`) | Per-month copies and balance arithmetic. | [`src/lib/months.test.ts`](../../../src/lib/months.test.ts) |
| **FX** (`src/lib/fx/rates.ts`) | Rate resolution and rounding behaviour. | [`src/lib/fx/rates.test.ts`](../../../src/lib/fx/rates.test.ts) |
| **SEO surfaces** | The marketing layer doubles as the LLM-facing API. | [`src/lib/seo.test.ts`](../../../src/lib/seo.test.ts), [`src/app/sitemap.test.ts`](../../../src/app/sitemap.test.ts) |
| **i18n hygiene** | Prevents Spanish leaking into TSX outside dictionaries. | [`src/lib/i18n/no-spanish-in-tsx.test.ts`](../../../src/lib/i18n/no-spanish-in-tsx.test.ts), [`src/lib/i18n/dictionaries.test.ts`](../../../src/lib/i18n/dictionaries.test.ts) |

## Patterns to copy

### Agent tool tests

- Mock `@/lib/db` at the module boundary with `vi.mock(...)` returning a
  `db` object that mirrors the Prisma client surface used by the tool.
- Assert on tool **input parsing** (Zod errors), **DB calls made**, and
  **output shape** the agent will see.
- Always cover at least one failure path (validation error,
  not-found, conflict).

### MCP tool tests

- Treat tool descriptions as part of the public API: when copy changes,
  update the test.
- Verify discovery payloads (`/.well-known/mcp.json`, `openapi.json`)
  expose exactly the tools and resources you intend.
- For per-user MCP: cover token-missing → 401, token-expired → 401, valid
  token → 200 + tool call.

### Webhook tests

- Verify signature **before** parsing body.
- Verify idempotency: feeding the same webhook event twice produces one
  side-effect.
- Verify graceful degradation: missing env (Telegram bot token) returns a
  typed error, not a 500.

### SEO / i18n tests

- `seo.test.ts` and `sitemap.test.ts` are the canonical references — when
  you add a public route, extend those tests.
- `no-spanish-in-tsx.test.ts` catches accidental hardcoded ES copy in
  `.tsx` files outside `src/lib/i18n/dictionaries/`. Adding a file that
  legitimately contains Spanish (an OG image, a marketing page) requires
  adding it to that test's `IGNORED_FILES` allowlist with a comment.

## Manual QA checklist (Clara-specific)

```md
Manual QA Checklist
- [ ] Voz rioplatense respetada en chat replies y en cualquier nueva UI
      string.
- [ ] El agent loop pide confirmación antes de mutar (mark paid, add
      expense, delete line, create bank). Mutaciones silenciosas son bug.
- [ ] Self-host smoke: borrá AI_GATEWAY_API_KEY / VERCEL_OIDC_TOKEN,
      TELEGRAM_*, BLOB_READ_WRITE_TOKEN y arrancá en local; la app debe
      levantar y degradar (no 500s en home/login).
- [ ] Telegram: enviar mensaje texto + voz → pipeline completo
      (transcribe + reply) y, si hay Blob, audio.
- [ ] Privacy claims en marketing-content.ts siguen siendo verdad (sin
      tracking, MIT, self-hosted).
- [ ] llms.txt y llms-full.txt rinden contenido coherente con la versión
      actual de marketing-content.ts.
- [ ] CI passes: lint + tsc --noEmit + vitest run + build.
```

## Coverage posture

- The repo enforces no minimum coverage threshold. Don't introduce one as
  a hard gate today — instead: **never lower coverage on a file you touch**.
- Pure helpers in `src/lib/**/*.ts` that don't talk to Prisma, Telegram,
  or the AI Gateway should approach 100% line coverage. They're cheap to
  test and cheap to break.
- DB-touching code is covered by mocking Prisma with `vi.mock("@/lib/db")`
  — see the agent-tools test for the canonical pattern.
- Provider modules (Telegram, AI Gateway) are tested with network-mocked
  clients. We don't hit real services from CI.

## Regression expectations

- Touching the **agent loop or any agent tool** → re-run
  `expense-tools.test.ts` style suites and add the new behaviour.
- Touching **MCP** (public or per-user) → re-run `mcp/public-server.test.ts`
  and update discovery JSON tests.
- Touching **auth / session / middleware** (`src/proxy.ts`,
  `src/lib/auth.ts`, `src/lib/api-token.ts`) → cover both anonymous and
  authenticated paths.
- Touching **marketing copy or `llms-content.ts`** → run
  `sitemap.test.ts` and `seo.test.ts`.
- Touching **prompts** → run the agent locally on at least three real-ish
  scenarios; voice changes are user-visible — see
  [`ux-writer`](../ux-writer/SKILL.md).

## Output format

When reporting QA results in a PR or review:

```md
## QA Report
- Scope: [...]
- Automated tests added/updated: [...]
- Manual checks run: [...]
- Findings: [...]
- Risk level: [Low / Medium / High]
```

## Coordination

- Pair with [`engineer-data`](../engineer-data/SKILL.md) for schema /
  migration changes.
- Pair with [`engineer-integrations`](../engineer-integrations/SKILL.md)
  for AI Gateway, Telegram, Vercel Blob, MCP.
- Pair with [`automated-user-comms`](../automated-user-comms/SKILL.md) when
  testing prompt or reply changes.
- Pair with [`ux-writer`](../ux-writer/SKILL.md) for voice / dictionary
  drift.
- Escalate privacy / consent regressions to
  [`legal-advisor`](../legal-advisor/SKILL.md).
