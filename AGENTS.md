<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md — table of contents for agents

This file is intentionally short. It is a **map**, not an encyclopedia. Its job
is to tell an agent where to look next.

> **Golden rule:** the repository is the system of record. Anything not
> discoverable from this repo effectively does not exist. Push context into the
> repo — not chat threads, not your head.

## Product in one line

**Clara** (repo `etracker`) is a chat-first, open-source (MIT),
self-hostable personal-finance assistant in Spanish rioplatense. Users chat with
their money in natural language, drop a PDF / bank screenshot / Telegram voice
note, and Clara extracts movements, suggests categories, and keeps the monthly
balance up to date. Ships with a public + per-user MCP server so any AI client
(Claude Desktop, Cursor, ChatGPT) can talk to Clara with the user's permission.

## Where to look first

1. [`README.md`](README.md) — public-facing description, tech stack, quick start.
2. [`ARCHITECTURE.md`](ARCHITECTURE.md) — domain map, layers, permitted edges.
3. [`knowledge/design-docs/index.md`](knowledge/design-docs/index.md) — core
   beliefs and cross-cutting patterns (rioplatense voice, AI Gateway routing,
   MCP servers, withApi error handling).
4. [`knowledge/product-specs/index.md`](knowledge/product-specs/index.md) —
   one spec per feature.
5. [`knowledge/exec-plans/active/`](knowledge/exec-plans/active) — in-flight
   multi-step plans.
6. [`src/lib/marketing-content.ts`](src/lib/marketing-content.ts) — the
   `CHANGELOG` (ES + EN) and all marketing copy. **This is the changelog.**

## Repository layout (high level)

```
src/
  app/
    (app)/             Authenticated shell (months, banks, settings, chat)
    (auth)/            Login / register UI
    (marketing)/       Public landing, features, FAQ, changelog, privacy
    (onboarding)/      First-run flow
    api/               REST handlers — every one wrapped in withApi()
    .well-known/       mcp.json, ai-plugin.json, security.txt
    sitemap.ts robots.ts manifest.ts opengraph-image.tsx llms.txt llms-full.txt
  components/
    month/             Subcomponents that compose <MonthDashboard />
    ui/                shadcn primitives
  lib/
    ai/                Agent loop, tools, transcription, TTS — Vercel AI SDK 6 via AI Gateway
    cache/             Vercel Runtime Cache wrappers (banks)
    blob/              Vercel Blob helpers (TTS audio)
    chat/              Chat persistence
    fx/ i18n/          Currency + locale helpers
    mcp/               Public + per-user MCP servers
    telegram/          Bot API client + signed deep-link tokens + menu
    http.ts            withApi() wrapper used by every route handler
    log.ts             Structured logging (Sentry-ready)
    auth.ts            NextAuth v4 (JWT) config
    db.ts              Prisma client singleton
    seo.ts             SEO/JSON-LD/llms.txt helpers
    marketing-content.ts  ES + EN marketing copy + CHANGELOG (single source of truth)
  proxy.ts             Next.js middleware (auth, locale, security)
prisma/                Schema + migrations (PostgreSQL)
public/                Static assets (sw.js, icons, manifests)
scripts/               One-off scripts
.github/workflows/     CI (lint, typecheck, test, build)
knowledge/             Agent knowledge base (this is the system of record)
.cursor/
  rules/               Always-applied rules
  skills/              Expert skills by domain
  mockups/             Visual references
```

## Operating principles (summary)

- **Rioplatense voice in user-facing text.** Clara habla como una amiga
  contadora. Sin tuteo, sin inglés corporativo, sin sermones. See
  [`.cursor/skills/ux-writer/SKILL.md`](.cursor/skills/ux-writer/SKILL.md).
- **Chat-first.** New capabilities should be accessible from the chat agent
  before (or alongside) any UI surface.
- **Errors flow through `withApi()`.** Route handlers stay tiny; mapping Zod /
  Prisma / business errors to HTTP shapes is centralised in
  [`src/lib/http.ts`](src/lib/http.ts). Never `try/catch + rethrow` in handlers.
- **AI uses the Vercel AI Gateway.** Models are referenced by `provider/model`
  strings and configurable via env (`AI_MODEL`). No
  direct `OPENAI_API_KEY` use for chat / classification.
- **MCP is a first-class surface.** Anything a user can do in the UI should
  consider whether the per-user MCP server should expose it as a tool. See
  [`src/lib/mcp/`](src/lib/mcp).
- **Self-hostable by default.** Optional integrations (AI Gateway, Blob,
  Runtime Cache, Telegram, Sentry) must degrade gracefully when env vars are
  missing.
- **Changelog goes in [`src/lib/marketing-content.ts`](src/lib/marketing-content.ts)**
  in both ES and EN. See [`.cursor/rules/changelog.mdc`](.cursor/rules/changelog.mdc).

## Operating process

- Plans for non-trivial work go under
  [`knowledge/exec-plans/active/`](knowledge/exec-plans/active). Move to
  `completed/` when done.
- New features get a short product spec in
  [`knowledge/product-specs/`](knowledge/product-specs) using the template, and
  an entry in the index.
- Cross-cutting decisions (AI prompts, auth, MCP) get a design doc in
  [`knowledge/design-docs/`](knowledge/design-docs).

## Git discipline

- Author + bypass corporate hooks: see
  [`.cursor/rules/git-author.mdc`](.cursor/rules/git-author.mdc) and
  [`.cursor/rules/git-push.mdc`](.cursor/rules/git-push.mdc). Always
  `--no-verify --no-gpg-sign` and override `user.email` per-command.
- `origin/main` is wired to Vercel: pushing to `main` triggers a production
  deploy that runs `prisma migrate deploy`. Run `npm run lint && npx tsc
  --noEmit && npm test && npm run build` before pushing.

## Sister project

- **trefolio** ([trefolio.com](https://trefolio.com)) — European multi-currency
  portfolio tracker by the same maintainer. Trefolio embeds this repo as a
  pinned git submodule for context (see trefolio's
  `knowledge/design-docs/etracker-clara-integration.md`). Trefolio's financial
  agents will call Clara over HTTP/MCP. Do not import any trefolio code into
  Clara.

If this map is ever wrong, fix it. The map is part of the code.
