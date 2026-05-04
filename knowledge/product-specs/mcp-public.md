# mcp-public

> No-auth public Model Context Protocol server that exposes Clara's
> marketing documentation (overview, features, FAQ, privacy,
> changelog) to any AI client. So Claude Desktop, Cursor, ChatGPT —
> anyone — can answer "what is Clara?" without a Clara account.

## What it does

A read-only MCP server at `https://clara.trefolio.com/api/mcp`:

- Exposes Clara's landing copy as **resources** (`clara://about`,
  `clara://features`, `clara://faq`, `clara://privacy`,
  `clara://changelog`).
- Exposes a small **tool** catalogue (`getOverview`, `getFeatures`,
  `getFaq`, `getChangelog`, `searchContent`) that returns the same
  content as markdown blobs, optionally filtered.
- Exposes **prompts** (`describe-clara`, `compare-clara`,
  `clara-changelog-summary`) that pre-fill helpful queries.
- Speaks Spanish (`?lang=es`) or English (`?lang=en`), resolved from
  the query string or `Accept-Language` header.
- Fully cached per locale at the route level (a `Map` of compiled
  handlers, not a per-request build).

## Where the code lives

| Layer | Path |
|-------|------|
| MCP server registration | [`src/lib/mcp/public-server.ts`](../../src/lib/mcp/public-server.ts) |
| Server tests | [`src/lib/mcp/public-server.test.ts`](../../src/lib/mcp/public-server.test.ts) |
| Route handler | [`src/app/api/mcp/[transport]/route.ts`](../../src/app/api/mcp/%5Btransport%5D/route.ts) |
| Marketing copy source | [`src/lib/marketing-content.ts`](../../src/lib/marketing-content.ts) |
| Discovery manifest | [`src/app/.well-known/mcp.json`](../../src/app/.well-known) |
| AI plugin manifest | [`src/app/.well-known/ai-plugin.json`](../../src/app/.well-known) |
| Locale primitives | [`src/lib/i18n/locale.ts`](../../src/lib/i18n/locale.ts) |

## Data model

None. The server is fully derived from
[`src/lib/marketing-content.ts`](../../src/lib/marketing-content.ts):

- `marketingContent(locale)` → `{ landing, features, faq, privacy }`.
- `CHANGELOG` constant (English single source).
- `PRODUCT_VERSION`, `SITE_NAME`, `SITE_DESCRIPTION` exported from
  `src/lib/seo.ts`.

## Contracts

### Endpoint

- `GET / POST / DELETE /api/mcp/<transport>` where `<transport>` is
  either `mcp` (Streamable HTTP) or `sse`.
- Locale resolution: `?lang=es|en` query param wins, then
  `Accept-Language` header, then `es` default.
- `maxDuration: 60` seconds.

### Resources

| URI | Title | Content |
|-----|-------|---------|
| `clara://about` | "Sobre Clara" / "About Clara" | Pitch markdown — features summary + main links. |
| `clara://features` | "Features de Clara" | Detailed list. |
| `clara://faq` | "FAQ de Clara" | All FAQ Q&A. |
| `clara://privacy` | "Política de privacidad" | Privacy section markdown. |
| `clara://changelog` | "Changelog" | Full release history. |

### Tools

| Name | Purpose | Input |
|------|---------|-------|
| `getOverview` | Returns the about markdown. | none |
| `getFeatures` | Returns features markdown. | none |
| `getFaq` | Returns FAQ markdown; optional `query` filter (case-insensitive). | `{ query?: string }` |
| `getChangelog` | Returns recent CHANGELOG entries. | `{ limit?: number }` |
| `searchContent` | Full-text search across landing / features / FAQ / privacy. | `{ query: string }` |

### Prompts

| Name | Purpose |
|------|---------|
| `describe-clara` | Pre-fills a "what is Clara?" question for the host model. |
| `compare-clara` | Compare Clara to a named competitor. |
| `clara-changelog-summary` | Summarise the latest releases. |

### Discovery

- `/.well-known/mcp.json` — MCP endpoint descriptor for AI clients
  that auto-discover servers.
- `/.well-known/ai-plugin.json` — legacy ChatGPT plugin manifest.

## Invariants

- **No auth.** This server is a documentation surface; it must be
  reachable by anonymous clients.
- **Cached per locale at module scope.** The route handler stores a
  `Map<Locale, handler>` so we build the MCP server once per locale
  per process, not per request.
- **Locale switch returns a separate handler.** Don't try to "reuse"
  the same server across locales — the registered resources, tools
  and prompts have locale-bound titles and descriptions.
- **Marketing content is the single source.** Don't duplicate
  pitch / FAQ / privacy text into the MCP server file. Always
  funnel through `marketingContent(locale)`.
- **Tool inputs are tiny.** The largest is `searchContent({ query })`.
  This server can never trigger a DB write, so input validation is
  schema-only and rejection is straightforward.
- **`force-dynamic`.** The route is dynamic to support SSE; static
  optimisation would break long-lived connections.

## Known gaps / TODOs

- We don't yet emit per-locale `mcp.json` discovery files. The
  current `/.well-known/mcp.json` is locale-neutral.
- `searchContent` is naive (substring on lowered text). Adequate for
  the current corpus; revisit if content grows by 10×.
- Telemetry: we don't track which tools / resources external clients
  call. Add structured logs when we want to learn what AI clients
  ask for.
- Discoverable changelog feed (RSS / Atom) is a separate concern
  and lives in marketing pages; the MCP `getChangelog` tool is the
  AI-client-friendly equivalent.
- We don't expose a public price / plans tool yet (Stripe upsells
  are gated by feature flag); add a `getPricing` tool when we go
  GA on Supporter.

## Related

- Spec: [`mcp-per-user`](mcp-per-user.md) — the authenticated sister
  surface, where actual user data is exposed via PAT bearer tokens.
- Spec: [`landing-and-marketing`](landing-and-marketing.md) — the
  marketing content source (when written).
- Spec: [`changelog`](changelog.md) — how new entries land in
  `marketing-content.ts` and propagate to the MCP server (when
  written).
- Skill: [`engineer-integrations`](../../.cursor/skills/engineer-integrations/SKILL.md)
- Design doc: [`with-api-error-handling`](../design-docs/with-api-error-handling.md)
  — `withApi()` is bypassed here because the MCP handler library
  manages its own error envelope.
