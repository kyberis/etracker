# Product specs index

One spec per feature, alphabetical. Each spec is a short markdown document
following [`../templates/product-spec.template.md`](../templates/product-spec.template.md).

> Specs describe **what** a feature does and **how** an engineer / agent
> changes it safely. Specs are not marketing copy — that lives in
> [`src/lib/marketing-content.ts`](../../src/lib/marketing-content.ts).

## Live specs

- [`account-soft-delete`](account-soft-delete.md) — self-service "Borrar mi cuenta"
  with a 30-day grace queue and one-click restore. Daily cron hard-deletes past
  the window; chat, MCP and Telegram nudge are paused while pending.
- [`ai-agent`](ai-agent.md) — chat-first AI agent: one tool registry (~45 tools),
  three entrypoints (web stream, Telegram one-shot, system-initiated tool-less
  reply), Spanish + English, 8-step budget, per-user-bound tools, guest-event
  scope variant.
- [`banks`](banks.md) — per-user banks/wallets/cards used to route every
  expense and (optionally) income. Restrict-on-delete, Runtime-cached `listBanks`,
  agent + REST + MCP coverage.
- [`billing-and-quota-upsell`](billing-and-quota-upsell.md) — optional Stripe-backed
  Supporter plan + one-time donations gated behind the `quota_upsell` feature flag.
  Surfaces in chat 429, settings, public `/upgrade`.
- [`event-sharing`](event-sharing.md) — multi-participant event wallets:
  share a trip via a one-shot link, invite friends with or without a
  Clara account (Telegram-only `GUEST` users supported), track "who
  paid what", and settle up at close with an equal-split breakdown
  and Telegram notifications.
- [`events`](events.md) — event wallets (trips, weddings, birthdays, any
  time-bound spend bucket). Group expenses by date range, close as a single
  lump-sum month or keep BY_DATE, with collapsible row in the dashboard and
  full agent / REST / MCP coverage.
- [`gdpr-compliance`](gdpr-compliance.md) — demonstrable consent, data
  export/delete endpoints, sub-processor registry, retention windows,
  self-host controller resolution, public `/contact` form + `/admin/contact`
  bandeja.
- [`import-pdf-image`](import-pdf-image.md) — PDF / image / CSV / voice
  ingest pipeline. Whisper for voice, vision for images, agent prompt rules
  enforce real transaction dates and confirmation before write. Partial unique
  index dedupes silent re-imports.
- [`income`](income.md) — multi-source monthly income via recurring `Income`
  templates and per-month `MonthIncomeLine` lines. Mirrors the expense data
  model; deprecates the old single `MonthRecord.income` field.
- [`mcp-per-user`](mcp-per-user.md) — authenticated MCP server at
  `/api/mcp/user`. PAT bearer (`clara_pat_…`) hashed with SHA-256, ~30 tools
  bound to the resolved user, per-user (240/min) and per-IP (60/min)
  rate-limit envelope.
- [`mcp-public`](mcp-public.md) — public no-auth MCP server at `/api/mcp`.
  Read-only marketing surface (`getOverview`, `getFeatures`, `getFaq`,
  `getChangelog`, `searchContent`) in Spanish + English.
- [`month-desktop-grid`](month-desktop-grid.md) — **PRD / requerimientos** de la
  vista desktop tipo planilla del mes: tabla por banco, gráficos, edición
  inline, simulación “qué pasa si…”, chat contextual por celda. Desktop ≥1100px.
  Mockup: `.cursor/mockups/month-excel-grid.html`. Incluye métricas, testing y DoD.
- [`months-and-templates`](months-and-templates.md) — core data model:
  `Expense` template + `MonthRecord` + `MonthExpenseLine`. `amountConverted`
  in primary currency, frozen `fxRate`, partial-unique dedupe on imports,
  carryover semantics.
- [`savings`](savings.md) — global savings pile backed by an immutable ledger
  (`SavingsMovement`). Monthly informational contribution, carry-over deposits,
  debt coverage on negative months, manual deposits/withdrawals. REST + agent
  + MCP coverage.
- [`telegram`](telegram.md) — second conversational channel for Clara: HMAC-signed
  deep-link vinculation, private-chat-only handler, reuses the same agent loop,
  tools, history window and daily quota as the web chat.
- [`telegram-daily-nudge`](telegram-daily-nudge.md) — proactive daily Telegram
  reminder sent at 20:00 local time when the user has not logged anything that
  day. Hourly Vercel cron, country→IANA timezone inference, tool-less AI path
  that does not consume the user's chat quota, opt-out toggle in Settings.

## Suggested first specs (high signal, write when touching)

- **expense-lines** — paid/unpaid state, edits, deletes, partial payments
  (mostly covered by `months-and-templates`; split out if it grows).
- **changelog** — how `marketing-content.ts` CHANGELOG flows to `/changelog`
  and JSON-LD.
- **landing-and-marketing** — `(marketing)/[lang]/` routes, single-source copy.
- **seo-and-llms** — sitemap, robots, JSON-LD, llms.txt / llms-full.txt,
  /.well-known/* endpoints.
- **auth-nextauth-jwt** — JWT strategy, Google sign-in, deny-by-default rules.

Add new specs by copying the template and linking them above.
