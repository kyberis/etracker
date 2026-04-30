# Product specs index

One spec per feature, alphabetical. Each spec is a short markdown document
following [`../templates/product-spec.template.md`](../templates/product-spec.template.md).

> Specs describe **what** a feature does and **how** an engineer / agent
> changes it safely. Specs are not marketing copy — that lives in
> [`src/lib/marketing-content.ts`](../../src/lib/marketing-content.ts).

## Live specs

- [`billing-and-quota-upsell`](billing-and-quota-upsell.md) — optional Stripe-backed
  Supporter plan + one-time donations gated behind the `quota_upsell` feature flag.
  Surfaces in chat 429, settings, public `/upgrade`.

## Suggested first specs (high signal, write when touching)

- **ai-agent** — chat loop, tool registry, prompt structure, approval flow.
- **months-and-templates** — recurring expense templates and per-month copies
  (the core data model).
- **expense-lines** — paid/unpaid state, edits, deletes, partial payments.
- **banks** — multi-bank routing, default bank, Runtime Cache invalidation.
- **import-pdf-image** — PDF / image / CSV extraction pipeline + AI classifier.
- **open-banking-revolut** — GoCardless integration, requisition flow,
  per-month sync, matching to templates.
- **whatsapp** — Twilio inbound, pairing, voice transcription, voice TTS reply.
- **mcp-public** — `/api/mcp` resources/tools/prompts, no auth.
- **mcp-per-user** — `/api/mcp/user`, PAT auth, tool catalog, rate limits.
- **changelog** — how `marketing-content.ts` CHANGELOG flows to `/changelog`
  and JSON-LD.
- **landing-and-marketing** — `(marketing)/[lang]/` routes, single-source copy.
- **seo-and-llms** — sitemap, robots, JSON-LD, llms.txt / llms-full.txt,
  /.well-known/* endpoints.
- **auth-nextauth-jwt** — JWT strategy, Google sign-in, deny-by-default rules.

Add new specs by copying the template and linking them above.
