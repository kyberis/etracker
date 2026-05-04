# mcp-per-user

> Authenticated MCP server that lets external AI clients (Claude
> Desktop, Cursor, ChatGPT) operate Clara on the user's own data via
> a bearer Personal Access Token. Same domain model as the agent;
> different surface, same boundary checks.

## What it does

A read+write MCP server at `https://clara.trefolio.com/api/mcp/user`:

- Requires a `Authorization: Bearer clara_pat_…` header (PAT minted
  in `/settings → Acceso para AI (MCP)`).
- Resolves the user from the SHA-256 hash of the bearer; rejects on
  any of: malformed prefix, unknown hash, revoked token, expired
  token, disabled or soft-deleted user.
- Exposes a curated set of read + write tools across banks,
  templates, month lines, income, savings, events, FX, locale, and
  user preferences — bound to the resolved `userId` so a token from
  user A cannot ever read or write user B's data.
- Rate-limits per user (240 req / minute) and per IP for unauth
  bursts (60 req / minute).

## Where the code lives

| Layer | Path |
|-------|------|
| MCP server registration | [`src/lib/mcp/user-server.ts`](../../src/lib/mcp/user-server.ts) |
| Route handler + auth wrapper + rate limit | [`src/app/api/mcp/user/[transport]/route.ts`](../../src/app/api/mcp/user/%5Btransport%5D/route.ts) |
| PAT issuance / verification | [`src/lib/api-token.ts`](../../src/lib/api-token.ts) |
| PAT tests | [`src/lib/api-token.test.ts`](../../src/lib/api-token.test.ts) |
| PAT settings UI | [`src/app/api/settings/`](../../src/app/api/settings) (CRUD) + the matching `/settings` page |
| Rate limiter | [`src/lib/rate-limit.ts`](../../src/lib/rate-limit.ts) |
| Prisma model | [`prisma/schema.prisma`](../../prisma/schema.prisma) — `ApiToken` |

## Data model

`ApiToken`:

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String @id @default(cuid())` | |
| `userId` | `String` | Cascade. |
| `tokenHash` | `String @unique` | Hex SHA-256 of the plaintext token. Plaintext is **never** stored. |
| `prefix` | `String` | First ~14 chars of the plaintext, displayed in the UI. |
| `name` | `String` | User-chosen label. |
| `revokedAt` | `DateTime?` | |
| `expiresAt` | `DateTime?` | Optional. |
| `lastUsedAt` | `DateTime?` | Best-effort bump on every request. |
| `createdAt` | `DateTime` | |

Token shape on the wire: `clara_pat_<64-hex-chars>`. The legacy
`ada_pat_` prefix is still accepted for old tokens
(`ACCEPTED_TOKEN_PREFIXES` in `api-token.ts`).

## Contracts

### Endpoint

- `GET / POST / DELETE /api/mcp/user/<transport>` (Streamable HTTP or
  SSE).
- Auth: `Authorization: Bearer clara_pat_…`. Returns `401` on any
  failure (no fine-grained reason, intentionally — see threat model).
- `force-dynamic`. `maxDuration: 60` seconds.

### Tool catalogue (~30 tools)

The user-server registers a curated subset of the agent's domain
surface — same boundary semantics as the in-app agent, so the model
sees a coherent API:

- **Months / state**: `getMonthState`, `createMonthIfNeeded`,
  `mergePendingTemplates`.
- **Banks**: `listBanks`, `createBank`, `updateBank`, `deleteBank`.
- **Expense templates**: `listExpenseTemplates`,
  `createExpenseTemplate`, `updateExpenseTemplate`,
  `deleteExpenseTemplate`.
- **Month expense lines**: `addMonthLine`, `updateMonthLine`,
  `deleteMonthLine`.
- **Income templates / lines**: `listIncomeTemplates`,
  `createIncomeTemplate`, `updateIncomeTemplate`,
  `deleteIncomeTemplate`, `addIncomeLine`, `updateIncomeLine`,
  `deleteIncomeLine`.
- **Savings**: `getSavingsState`, `addSavingsMovement`,
  `deleteSavingsMovement`, `setMonthlySavingsContribution`.
- **Events**: `listEvents`, `getActiveEvents`, `getEvent`,
  `createEvent`, `updateEvent`, `closeEvent`, `reopenEvent`.
- **FX & preferences**: `getFxRate`, `setPrimaryCurrency`,
  `setUserLocale`, `updateExpenseImportInstructions`.

(Exact list: see `registerUserMcp` in
[`src/lib/mcp/user-server.ts`](../../src/lib/mcp/user-server.ts).)

### Auth wrapper

`withMcpAuth(baseHandler, async (_req, bearer) => {...}, { required: true })`:

- Calls `verifyBearerToken(bearer)` from
  [`src/lib/api-token.ts`](../../src/lib/api-token.ts).
- On success returns `{ token, clientId, scopes:
  ["finance:read","finance:write"], extra: { userId, tokenId } }`.
- The `userId` is read by every tool body off
  `extra.authInfo.extra.userId`.

### Rate limit envelope

- **Per user**: 240 req / 60s on key `mcp.user`. Tight enough that
  a leaked PAT can't quietly burn through Gateway / OpenAI quota;
  generous enough that a normal Claude Desktop session never hits
  it.
- **Per IP (unauth)**: 60 req / 60s on key `mcp.user.unauth`. Stops
  anonymous bursts probing for a valid hash.

## Invariants

- **Plaintext tokens are never persisted.** Only `sha256(plaintext)`
  goes into the DB. The plaintext is shown to the user **once** at
  creation time.
- **Constant-time hash comparison.** Verification uses
  `timingSafeEqual` on hex buffers via `safeEqualHash`.
- **Soft-deleted users can't use a previously-minted PAT.** The
  pull joins `User.isActive` and `User.deletedAt` so the 30-day
  grace window does not expose the API.
- **Tools read user id from auth context only.** No tool accepts a
  client-supplied `userId`. The bearer is the only source of truth.
- **PAT prefix list controls accepted tokens at the edge.** Adding
  a new prefix means migrating existing tokens or accepting both for
  a release.
- **`lastUsedAt` is best-effort.** A failed update is logged but
  never blocks the request.
- **Rate-limit errors return a structured `Response` from the
  helper.** No `withApi` here; the MCP library owns the envelope.

## Known gaps / TODOs

- Scopes today are coarse (`finance:read`, `finance:write`). A
  per-tool ACL would let us mint "read-only" PATs for sharing
  dashboards.
- We don't expose a "rotate token" UX yet — users must revoke +
  create new.
- No per-PAT rate limit; one user with multiple PATs shares the
  240/min budget. If we ever hit abuse, we'd partition by
  `tokenId`.
- We don't surface `lastUsedAt` in a per-PAT activity log; just on
  the listing.
- Telegram users get the same agent surface but via the bot, not
  via PAT. There's no "use my PAT in Telegram" flow today.
- `withMcpAuth` doesn't run our own `withApi` wrapper, so error
  messages from tool bodies surface verbatim. Tools return
  structured `content[]` themselves; keep them defensive.

## Related

- Spec: [`mcp-public`](mcp-public.md) — the no-auth marketing
  surface.
- Spec: [`ai-agent`](ai-agent.md) — the in-app counterpart, same
  tool semantics.
- Skill: [`engineer-integrations`](../../.cursor/skills/engineer-integrations/SKILL.md)
- Skill: [`legal-advisor`](../../.cursor/skills/legal-advisor/SKILL.md)
  — privacy + sub-processor disclosure for "AI clients".
- Design doc: [`with-api-error-handling`](../design-docs/with-api-error-handling.md)
- Design doc: [`ai-gateway-routing`](../design-docs/ai-gateway-routing.md)
