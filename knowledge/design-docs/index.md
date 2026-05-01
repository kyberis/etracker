# Design docs index

Design docs capture cross-cutting decisions that aren't obvious from the code.

## Live docs

- [core-beliefs](core-beliefs.md) — the non-negotiables (rioplatense voice,
  chat-first, AI Gateway routing, errors via `withApi()`, privacy,
  self-hostable).
- [stripe-integration](stripe-integration.md) — provider choice, env vars,
  webhook idempotency, type-version pinning, and the env+flag gating
  matrix for the optional Supporter tier and donations.
- [telegram-deep-link-tokens](telegram-deep-link-tokens.md) — why the Telegram
  channel uses stateless HMAC-signed `?start=<token>` deep links instead of
  a DB-backed code, threat model, and rotation notes.
- [savings-ledger](savings-ledger.md) — append-only `SavingsMovement` ledger
  + denormalized `User.savings` cache, single chokepoint at `src/lib/savings.ts`,
  invariant `User.savings === SUM(amount)`.

## Suggested next docs (write when needed)

- `ai-agent-loop.md` — how the chat agent decides which tool to call, how the
  approval-before-write rule is enforced, prompt structure.
- `mcp-tokens.md` — PAT lifecycle (create / hash / expire / revoke), scopes,
  rate limiting on `/api/mcp/user`.
- `marketing-content-as-source.md` — why landing/changelog/privacy live in
  `src/lib/marketing-content.ts` and not in MD or CMS.
- `runtime-cache-invalidation.md` — cache tags for banks + year timeline.

Add new docs by copying [`../templates/design-doc.template.md`](../templates/design-doc.template.md)
and linking them above.
