# Design docs index

Design docs capture cross-cutting decisions that aren't obvious from the code.

## Live docs

- [core-beliefs](core-beliefs.md) — the non-negotiables (rioplatense voice,
  chat-first, AI Gateway routing, errors via `withApi()`, privacy,
  self-hostable).
- [with-api-error-handling](with-api-error-handling.md) — why every route is
  wrapped in `withApi()`, how Zod / Prisma / business errors map to HTTP
  responses, what NOT to do.
- [ai-gateway-routing](ai-gateway-routing.md) — when chat goes through Vercel
  AI Gateway vs direct OpenAI, why Whisper / TTS hit OpenAI directly, the
  three agent entrypoints (web stream, Telegram one-shot, system-initiated
  tool-less reply) and their invariants.
- [stripe-integration](stripe-integration.md) — provider choice, env vars,
  webhook idempotency, type-version pinning, and the env+flag gating
  matrix for the optional Supporter tier and donations.
- [telegram-deep-link-tokens](telegram-deep-link-tokens.md) — why the Telegram
  channel uses stateless HMAC-signed `?start=<token>` deep links instead of
  a DB-backed code, threat model, and rotation notes.
- [savings-ledger](savings-ledger.md) — append-only `SavingsMovement` ledger
  + denormalized `User.savings` cache, single chokepoint at `src/lib/savings.ts`,
  invariant `User.savings === SUM(amount)`.
- [occurred-on-month-bucketing](occurred-on-month-bucketing.md) — month bucket
  follows `occurredOn` (not creation month), `occurredOnSource` for estimated
  vs artifact dates, rebucket rules. Exec plan:
  [`cross-month-crud-act-first`](../exec-plans/active/cross-month-crud-act-first.md).

## Suggested next docs (write when needed)

- `marketing-content-as-source.md` — why landing/changelog/privacy live in
  `src/lib/marketing-content.ts` and not in MD or CMS.
- `runtime-cache-invalidation.md` — cache tags for banks + year timeline.
- `event-wallets-attribution.md` — the `LUMP_SUM` vs `BY_DATE` attribution
  trade-off when a multi-month event closes.

Add new docs by copying [`../templates/design-doc.template.md`](../templates/design-doc.template.md)
and linking them above.
