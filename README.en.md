<div align="center">

<img src="public/clara-avatar-simple.png" width="120" alt="Clara Lovelace — AI personal finance assistant" />

# Clara Lovelace

### Your money, finally clear.

**Open-source, chat-first personal finance with AI — rioplatense Spanish by default, English supported.**  
Send a bank screenshot, a PDF, or a voice note on Telegram: Clara extracts movements, suggests categories, and keeps your monthly balance up to date.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![GitHub Repo stars](https://img.shields.io/github/stars/kyberis/etracker?style=social)](https://github.com/kyberis/etracker/stargazers)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF?logo=githubactions&logoColor=white)](.github/workflows/ci.yml)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

**[Live demo](https://clara.trefolio.com)** · **[Quick start](#-quick-start)** · **[Environment variables](#%EF%B8%8F-environment-variables-step-by-step)** · **[Deploy](#%EF%B8%8F-deploy)** · **[MCP](#-mcp-endpoints)** · **[About](#-about-clara-lovelace)** · **[Contributing](./CONTRIBUTING.md)**

</div>

---

## 💬 Two messages

> **You:** I paid rent today, $850
>
> **Clara:** Done — **Rent** is marked paid for April ✅. You have **$1,240** left for pending expenses this month.
>
> **You:** _[attach a bank PDF]_
>
> **Clara:** Parsed. I found 14 movements; 9 matched planned lines and I marked them paid. **5 look new** — review the proposal and confirm what you want saved.

No spreadsheet. No manual tagging. No opening an app.

---

## ✨ Why another finance app?

Most are the same thing dressed up: rows, categories, reports — pretty for two weeks, dead by the second month.

**Clara is chat-first, open source, and self-hostable.** You talk to your money in plain language. Send a PDF and it understands. Send a voice note and it records the expense. AI is the **core of the product**, not a marketing label.

---

## 🎯 Feature overview

| | |
|---|---|
| 🤖 **Reads your statements** | Drop a bank screenshot, PDF, or CSV. Clara extracts movements, suggests categories, and always asks before touching anything. |
| 🎙️ **Listens to voice notes** | "I paid rent" via Telegram is enough. Clara transcribes, classifies, and updates the month. |
| 📅 **Month-by-month** | A template defines a recurring expense. Each month gets its own independent copy. |
| 🏦 **Multi-bank** | Every expense knows which account it lives in. |
| 📊 **Charts when useful** | Clara renders inline charts only when they add context. |
| 💬 **Spanish and English** | Rioplatense Spanish by default; switch to English from the menu or by asking Clara in chat. |
| 🔓 **Your data is yours** | MIT licence. Self-hostable on any Vercel + Postgres setup. No telemetry, no tracking, no AI upsell. |
| 🤝 **MCP for your AI** | Clara exposes an MCP server. Connect it to Claude Desktop, Cursor, or ChatGPT to query and update your finances with your permission. |

---

## 🧠 What makes Clara technically interesting

- **Real tool-calling agent, not string parsing** — 33 Zod-typed tools execute directly against Prisma. The model plans, calls tools, and stops under a fixed step budget (`stopWhen: stepCountIs(8)`).
- **MCP as a first-class surface** — public discovery at `/api/mcp` plus a per-user server at `/api/mcp/user` with PAT auth, destructive parity (`confirm: true`), and per-user rate limits so a leaked key cannot burn your quota silently.
- **Production-grade multimodal** — PDFs, bank screenshots and Telegram voice notes share one extraction pipeline. Structured JSON logs carry `traceId`, tokens, and estimated USD per step for cost attribution via AI Gateway tags.

---

## 🖼️ Screenshots

<table>
<tr>
<td width="50%" align="center">
<img src="./public/screenshots/mobile-chat.png" alt="Web chat — clara.trefolio.com" width="320" />
<br/><strong>Web chat</strong> — log an expense, ask for a roast, or attach a PDF
</td>
<td width="50%" align="center">
<img src="./public/screenshots/telegram-chart.png" alt="Telegram — inline charts" width="320" />
<br/><strong>Telegram</strong> — inline charts when they actually help
</td>
</tr>
</table>

---

## 🚀 Quick start

> **Prerequisites:** Node.js 22+, npm, a PostgreSQL 16 database (Docker below works).

```bash
# 1. Clone
git clone https://github.com/kyberis/etracker.git
cd etracker

# 2. Install dependencies
npm install

# 3. Create your env file
cp .env.example .env.local
# Open .env.local and fill in the variables — see the section below

# 4. Start Postgres (optional: use any existing Postgres 14+ instance)
docker compose up -d

# 5. Apply database migrations
npm run prisma:migrate

# 6. Start the dev server
npm run dev
```

Open **http://localhost:3000** and create your account.

> 💡 **No Docker?** Any Postgres 14+ instance works. Just point `DATABASE_URL` at it.

---

## ⚙️ Environment variables — step by step

Copy `.env.example` to `.env.local` and follow the sections below.  
Variables marked **required** will cause the app to crash or fail silently at startup if missing.

---

### 1 — Core (always required)

These three are the minimum to run the app locally.

#### `DATABASE_URL` — **required**

PostgreSQL connection string.

```bash
# Docker (from docker compose up -d):
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/etracker?schema=public"

# Neon (managed, recommended for Vercel deploy):
# Use the *pooled* URL from the Neon dashboard → Connection string → Pooled
DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Any other Postgres 14+:
DATABASE_URL="postgresql://user:pass@host:5432/dbname?schema=public"
```

> **Neon tip:** Add `sslmode=verify-full` (or your provider's recommendation) to suppress the node-pg SSL deprecation warning.

#### `NEXTAUTH_URL` — **required**

The public URL of the app (used by NextAuth for callback redirects).

```bash
NEXTAUTH_URL="http://localhost:3000"          # local dev
# NEXTAUTH_URL="https://clara.trefolio.com"  # production
```

#### `NEXTAUTH_SECRET` — **required**

A long random string used to sign JWT session tokens. Generate one:

```bash
openssl rand -base64 32
```

```bash
NEXTAUTH_SECRET="paste-the-output-here"
```

---

### 2 — AI (required for the chat agent)

Clara supports two modes. **Mode A (AI Gateway)** is preferred in production because it supports model fallover, cost tracking, and zero-data-retention calls.

#### Mode A — Vercel AI Gateway (recommended)

```bash
# Run once to link your local project to Vercel:
vercel link

# Pull environment variables (refreshes VERCEL_OIDC_TOKEN, valid ~12h):
vercel env pull .env.local
```

`VERCEL_OIDC_TOKEN` is auto-provisioned by Vercel — you do not set it manually.

If you are running in CI or without `vercel env pull`, set the fallback key instead:

```bash
# Get from: https://vercel.com/<team>/<project>/settings → AI Gateway
AI_GATEWAY_API_KEY="ag_..."
```

#### Mode B — OpenAI directly (simpler, no gateway features)

```bash
OPENAI_API_KEY="sk-..."
```

> **Note:** `OPENAI_API_KEY` is **always required** even in Mode A, because Whisper (voice transcription) and TTS still hit OpenAI directly — the AI Gateway does not expose the speech endpoint.

#### Model override (optional)

```bash
# Default: openai/gpt-5.4  (via AI Gateway format: provider/model)
AI_MODEL="openai/gpt-4o"
```

---

### 3 — Telegram bot (optional — enables Telegram channel)

Without these, the Telegram webhook route returns 503 and the web chat still works normally.

**Step 1 — Create a bot with @BotFather:**

1. Open Telegram and start a chat with `@BotFather`.
2. Send `/newbot` and follow the prompts.
3. Copy the token shown at the end.

**Step 2 — Set variables:**

```bash
TELEGRAM_BOT_TOKEN="123456:ABC-your-token-here"
TELEGRAM_BOT_USERNAME="ClaraTreBot"     # your bot's @handle, without the @
TELEGRAM_WEBHOOK_SECRET="any-random-string-you-choose"  # Clara uses this to verify Telegram calls your server
```

**Step 3 — Register the webhook** (after deploying to a public URL):

```bash
# Set the public URL once:
TELEGRAM_WEBHOOK_URL="https://your-domain.com/api/webhooks/telegram"

# Then register:
npm run telegram:webhook
```

**Optional — dedicated link token secret:**

```bash
# Signs the deep-link codes emitted by /api/settings/telegram.
# Falls back to NEXTAUTH_SECRET when unset — fine for dev, use a separate key in prod.
TELEGRAM_LINK_TOKEN_SECRET="another-random-string"
```

---

### 4 — Google sign-in (optional)

Without these, email/password and passkey login still work.

1. Go to [Google Cloud Console → APIs & Credentials](https://console.cloud.google.com/apis/credentials).
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Add authorised redirect URI: `{NEXTAUTH_URL}/api/auth/callback/google`.

```bash
GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-..."
```

---

### 5 — Email verification with Resend (optional but recommended in production)

Without these, email/password sign-up still works — but the verification email is only logged to the console (not sent). **Do not ship to production without this.**

1. Create a free account at [resend.com](https://resend.com).
2. Add and verify your sending domain.
3. Create an API key.

```bash
RESEND_API_KEY="re_..."
RESEND_FROM_ADDRESS="Clara <noreply@your-domain.com>"

# Public origin used to build the verification link in the email:
APP_BASE_URL="https://your-domain.com"

# JWT secret for the verification token (falls back to NEXTAUTH_SECRET):
APP_SESSION_SECRET="another-long-random-string"
```

---

### 6 — Rate limiting with Upstash Redis (optional but recommended in production)

Without these, rate limiters fail open (no limiting). Fine for local dev, not for production.

1. Create a free Redis database at [console.upstash.com](https://console.upstash.com).
2. Copy **REST URL** and **REST Token**.

```bash
UPSTASH_REDIS_REST_URL="https://xxx.upstash.io"
UPSTASH_REDIS_REST_TOKEN="AXxx..."
```

---

### 7 — Vercel Blob (optional — required for in-app TTS voice replies)

Without this, text-to-speech replies are disabled silently. Regular chat still works.

1. Enable **Vercel Blob** on your project in the Vercel dashboard.
2. Copy the read-write token.

```bash
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."

# TTS model + voice (optional, the defaults below are sensible):
# OPENAI_TTS_MODEL="gpt-4o-mini-tts"
# OPENAI_TTS_VOICE="nova"
```

---

### 8 — Cloudflare Turnstile captcha (optional)

Without these, sign-up and login work — but there is no bot protection. Enable in production.

1. Go to [Cloudflare Dashboard → Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile).
2. Create a site and copy the **Site Key** and **Secret Key**.

```bash
NEXT_PUBLIC_TURNSTILE_SITE_KEY="0x..."
TURNSTILE_SECRET_KEY="0x..."
```

To hard-disable Turnstile (e.g. in staging):

```bash
TURNSTILE_DISABLED="1"
NEXT_PUBLIC_TURNSTILE_DISABLED="1"
```

---

### 9 — SEO & Search Console verification (optional)

```bash
# Paste only the value of the `content` attribute from the <meta> verification tag:
GOOGLE_SITE_VERIFICATION="abc123"
BING_SITE_VERIFICATION="xyz789"

# Canonical public URL used by sitemap, robots.txt, OG images, JSON-LD, and email links:
NEXT_PUBLIC_APP_URL="https://your-domain.com"
```

---

### 10 — Observability with Sentry (optional)

`@sentry/nextjs` is **not** a hard dependency — install it yourself if you want error forwarding.

```bash
npm install @sentry/nextjs
```

```bash
SENTRY_DSN="https://xxx@xxx.ingest.sentry.io/xxx"
```

---

### 11 — Inline charts via QuickChart (optional)

```bash
# Set to "0" to disable chart images in chat responses:
# CLARA_OUTBOUND_CHART_IMAGES="0"

# Point at a self-hosted QuickChart instance (default: public quickchart.io):
# CLARA_QUICKCHART_BASE_URL="https://quickchart.io"
```

---

### Minimal `.env.local` for local development

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/etracker?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="replace-with-openssl-rand-base64-32"
OPENAI_API_KEY="sk-..."
```

Everything else is optional and degrades gracefully in dev.

---

### Full variable reference

| Variable | Required | Default | What it does |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `NEXTAUTH_URL` | ✅ | — | Public app URL (NextAuth callbacks) |
| `NEXTAUTH_SECRET` | ✅ | — | JWT session signing secret |
| `OPENAI_API_KEY` | ✅ | — | OpenAI key (Whisper + TTS, always needed) |
| `VERCEL_OIDC_TOKEN` | — | auto | AI Gateway auth via `vercel env pull` |
| `AI_GATEWAY_API_KEY` | — | — | AI Gateway fallback key |
| `AI_MODEL` | — | `openai/gpt-5.4` | Chat model override (`provider/model`) |
| `GOOGLE_CLIENT_ID` | — | — | Google OAuth sign-in |
| `GOOGLE_CLIENT_SECRET` | — | — | Google OAuth sign-in |
| `TELEGRAM_BOT_TOKEN` | — | — | Telegram bot token |
| `TELEGRAM_BOT_USERNAME` | — | — | Bot handle without `@` |
| `TELEGRAM_WEBHOOK_SECRET` | — | — | Validates inbound Telegram requests |
| `TELEGRAM_LINK_TOKEN_SECRET` | — | `NEXTAUTH_SECRET` | Signs Telegram deep-link codes |
| `TELEGRAM_WEBHOOK_URL` | — | — | Used by `npm run telegram:webhook` |
| `RESEND_API_KEY` | — | — | Email verification sends |
| `RESEND_FROM_ADDRESS` | — | `Clara <noreply@...>` | Sender address |
| `APP_BASE_URL` | — | `NEXTAUTH_URL` | Canonical origin for email links |
| `APP_SESSION_SECRET` | — | `NEXTAUTH_SECRET` | JWT secret for email verification tokens |
| `UPSTASH_REDIS_REST_URL` | — | — | Rate limiting (fails open without it) |
| `UPSTASH_REDIS_REST_TOKEN` | — | — | Rate limiting |
| `BLOB_READ_WRITE_TOKEN` | — | — | Vercel Blob for TTS audio uploads |
| `OPENAI_TTS_MODEL` | — | `gpt-4o-mini-tts` | TTS model |
| `OPENAI_TTS_VOICE` | — | `nova` | TTS voice |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | — | — | Cloudflare Turnstile (captcha) |
| `TURNSTILE_SECRET_KEY` | — | — | Cloudflare Turnstile |
| `TURNSTILE_DISABLED` | — | — | Set `"1"` to hard-disable captcha |
| `NEXT_PUBLIC_APP_URL` | — | `NEXTAUTH_URL` | Canonical URL for sitemap / OG |
| `GOOGLE_SITE_VERIFICATION` | — | — | Search Console `<meta>` value |
| `BING_SITE_VERIFICATION` | — | — | Bing Webmaster `<meta>` value |
| `SENTRY_DSN` | — | — | Error forwarding (needs `@sentry/nextjs`) |
| `CLARA_OUTBOUND_CHART_IMAGES` | — | `1` | Set `"0"` to disable chat charts |
| `CLARA_QUICKCHART_BASE_URL` | — | `https://quickchart.io` | Self-hosted QuickChart |

---

## 🏗️ Architecture

```mermaid
flowchart LR
    User --> Web[Next.js App Router]
    User --> TG[Telegram Bot]
    Web --> Agent[Vercel AI SDK 6 + AI Gateway]
    TG --> Agent
    Agent --> Tools[33 typed tools · Zod]
    Tools --> Prisma[Prisma + Postgres]
    Tools --> FX[FX rates]
    Tools --> Charts[QuickChart PNGs]
    Web --> MCP[MCP public + per-user PAT]
    MCP --> Tools
    Agent --> Cache[Vercel Runtime Cache]
    Agent --> Blob[Vercel Blob · TTS]
    Agent --> Logs[Structured logs · tokens, USD, traceId]
```

---

## 📁 Repository layout

```
src/
  app/                 Next.js App Router
    (app)/             Authenticated shell (banks, months, settings…)
    (auth)/            Login / sign-up UI
    (marketing)/       Public landing, features, FAQ, changelog, privacy
    api/               REST handlers — all use withApi()
  components/
    month/             Sub-components composing <MonthDashboard />
    ui/                shadcn primitives
  lib/
    ai/                Agent, tools, transcription, TTS
    cache/             Vercel Runtime Cache wrappers (banks)
    blob/              Vercel Blob helpers (TTS)
    telegram/          Bot API client + link-code helpers
    http.ts            withApi() wrapper used by every route handler
    log.ts             Structured log helper (Sentry-ready)
prisma/                Schema + migrations
public/                Static assets (sw.js, icons, manifests…)
.github/workflows/     CI (lint, typecheck, test, build)
```

---

## 🧪 Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm test` | Run Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run format` | Prettier |
| `npm run prisma:migrate` | Apply migrations (dev) |
| `npm run prisma:deploy` | Apply migrations (production) |
| `npm run telegram:webhook` | Register Telegram webhook |

---

## 🔌 MCP endpoints

Clara exposes two MCP servers any compatible client can consume.

### Public — `/api/mcp`

No auth required. Exposes Clara's product documentation (features, FAQ, changelog, privacy) as resources, tools, and prompts. Add `?lang=en` or `Accept-Language: en` for English content.

```json
{
  "mcpServers": {
    "clara-docs": { "url": "https://clara.trefolio.com/api/mcp?lang=en" }
  }
}
```

### Per-user — `/api/mcp/user`

Bearer token required. Generate a token from **Settings → AI access (MCP)**. Paste it into Claude Desktop, Cursor, or any MCP client.

```json
{
  "mcpServers": {
    "clara": {
      "url": "https://clara.trefolio.com/api/mcp/user",
      "headers": { "Authorization": "Bearer clara_pat_..." }
    }
  }
}
```

Available tools: `getProfile`, `listBanks`, `listExpenseTemplates`, `listMonths`, `getMonth`, `getCurrentBalance`, `getYearTimeline`, `addExpenseTemplate`, `addExpenseToMonth`, `markLinePaid`, `deleteLine` (requires `confirm: true`), `createBank`.

Discovery endpoint: `/.well-known/mcp.json`. Tokens are SHA-256 hashed, expirable, and revocable from Settings.

---

## ☁️ Deploy

### Vercel + Neon (recommended)

1. Create a **Neon Postgres** (or any managed Postgres). Use the **pooled** connection URL for `DATABASE_URL`.
2. Import the repository in Vercel and set the environment variables from **Section 1–2** above. Add the rest as needed.
3. Run `vercel link` locally so `VERCEL_OIDC_TOKEN` is provisioned for AI features.
4. Deploy. Production deploys run `prisma migrate deploy` automatically (guarded by `VERCEL_ENV` in `vercel.json`). Preview deploys never touch the database.

### Self-host

Clara is a plain Next.js 16 + Postgres app. It runs on anything that can run Node 22 + Postgres 14+:

- Docker / docker-compose (a `docker-compose.yml` is included for the database)
- Fly.io, Railway, Render, Coolify, Dokku
- Any VPS

Optional integrations (Vercel AI Gateway, Blob, Runtime Cache) all degrade gracefully — without them the app still works, just without those specific features.

---

## 🔐 Auth notes

- Strategy is `jwt` (NextAuth `session.strategy === "jwt"`). `Session` and `VerificationToken` tables are dropped by a migration because they are never read with this strategy.
- The Prisma adapter is kept because it persists `User` and `Account` rows on first Google sign-in.
- Google sign-in defaults to **deny** when `email_verified` is not explicitly `true`.

---

## 🗺️ Roadmap

- [x] English / multi-locale UI (base: `User.locale`, `es`/`en` dictionaries, bilingual agent prompts)
- [ ] CSV / OFX import from banks
- [ ] Budgets and alerts
- [ ] Multi-currency (display + conversion)
- [ ] Native voice capture on mobile
- [x] Public landing + demo ([clara.trefolio.com](https://clara.trefolio.com))

Have an idea? [Open an issue](https://github.com/kyberis/etracker/issues/new) — half-formed ones are fine too.

---

## 🤝 Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) and the [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## 🙏 Credits

Built on the shoulders of giants: [Next.js](https://nextjs.org) · [React](https://react.dev) · [Vercel](https://vercel.com) · [Vercel AI SDK](https://sdk.vercel.ai) · [Prisma](https://www.prisma.io) · [PostgreSQL](https://www.postgresql.org) · [Tailwind CSS](https://tailwindcss.com) · [shadcn/ui](https://ui.shadcn.com) · [NextAuth.js](https://next-auth.js.org) · [Zod](https://zod.dev) · [Telegram Bot API](https://core.telegram.org/bots/api) · [OpenAI](https://openai.com) · [Upstash](https://upstash.com) · [Vitest](https://vitest.dev)

---

## 💡 About Clara Lovelace

The name is a double tribute: to the idea of **clarity** — the product's goal is that your finances finally _become clear_ — and to **Ada Lovelace**, the nineteenth-century mathematician who wrote the first algorithm in history, decades before a machine existed that could run it. She understood that machines could do more than calculate: they could reason.

Clara Lovelace was born from that same spirit: that intelligence, well applied, transforms raw data into clear decisions. Your bank statements are just numbers — Clara turns them into a picture of your financial life.

Built by the team behind [trefolio.com](https://trefolio.com).

---

## 📄 Licence

[MIT](./LICENSE) — do whatever you want, just don't blame us if your accountant gets upset.

---

<div align="center">

### Liked Clara?

**[⭐ Star it on GitHub](https://github.com/kyberis/etracker)** — the cheapest way to support the project.

**[🐛 Report a bug](https://github.com/kyberis/etracker/issues/new)** · **[💬 Open a discussion](https://github.com/kyberis/etracker/discussions)**

_Made with ☕ and a healthy distrust of spreadsheets._

Made by [trefolio.com](https://trefolio.com)

</div>
