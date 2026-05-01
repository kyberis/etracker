# Contributing to Clara

Thanks for considering a contribution. Clara is open source (MIT) and we
welcome bug reports, ideas, and pull requests.

> The fastest way to get a fix or feature in is to open an issue first
> describing what you want to do — that lets us catch scope or design issues
> before you spend time on a PR.

## Quick links

- Live demo: https://clara.trefolio.com
- Architecture and stack overview: [README.md](./README.md)
- English README: [README.en.md](./README.en.md)
- Issue templates: [.github/ISSUE_TEMPLATE](.github/ISSUE_TEMPLATE)
- Code of Conduct: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)

## Local setup

Prerequisites: Node 22+, npm, Docker (for Postgres) or any Postgres 16
instance, and a `.env.local` based on `.env.example`.

```bash
git clone https://github.com/kyberis/etracker.git
cd etracker
npm install
cp .env.example .env.local            # fill in DATABASE_URL + AI_GATEWAY_API_KEY
docker compose up -d                   # optional: starts Postgres locally
npx prisma migrate dev
npm run dev                            # http://localhost:3000
```

The full setup, including Telegram and MCP wiring, is documented in the
README.

## Branch + commit etiquette

- Branch off `main`. Use a descriptive name: `fix/...`, `feat/...`, `chore/...`.
- Keep PRs small and focused. If your change is "bug fix + refactor", open
  two PRs.
- Commit messages don't have to follow Conventional Commits, but a short
  imperative subject (`add MCP rate limit`) makes the changelog easier to
  curate.

## Required checks

Before opening a PR, please run:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

CI runs the same four steps plus a Prisma schema drift check. PRs that fail
CI will not be merged.

## Bilingual content

Clara ships in **Spanish (rioplatense)** and **English** simultaneously. If
your change adds, removes, or edits **user-facing** text, update both
locales:

- UI strings live in `src/lib/i18n/{es,en}.ts`.
- Marketing copy and the public changelog live in
  `src/lib/marketing-content.ts` (parallel ES/EN sections).
- API errors and AI tool descriptions are kept in **neutral English** unless
  there's a strong reason to localize. The
  `no-spanish-in-tsx.test.ts` and `no-spanish-in-api-errors.test.ts` tests
  enforce this — if you add a legitimately Spanish file, whitelist it
  there with a one-line justification.

## Changelog entries

Anything user-visible should land with a CHANGELOG entry in
`src/lib/marketing-content.ts` (both `es` and `en`). Internal refactors and
test-only changes don't need an entry.

The `release-manager` skill (`.cursor/skills/release-manager/SKILL.md`)
documents how versions are cut.

## AI tooling

If you're touching the AI agent (`src/lib/ai/**`):

- All tools are typed with Zod and call Prisma directly. No string parsing
  of LLM output.
- The system prompt lives in `src/lib/ai/prompts.ts` and switches by locale.
- Keep tool `description` and `.describe()` strings in neutral English.
  Internal hints the model reads (carryover notes, structured returns) can
  be locale-keyed when it materially helps the response.
- New tools must show up in the per-user MCP. If a tool is destructive,
  follow the `confirm: true` confirmation pattern from `deleteLine`.

## Reporting security issues

Please do **not** open a public issue for security reports. Email the
maintainer at the address in the package metadata, or use GitHub Security
Advisories on this repo.

## Code of Conduct

By participating you agree to abide by the [Contributor Covenant 2.1](./CODE_OF_CONDUCT.md).
