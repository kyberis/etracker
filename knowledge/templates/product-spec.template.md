# <feature-name>

> One-line summary of what this feature does.

## What it does

User-visible behaviour. What changes for the user when this feature is in
play. Keep it concrete.

## Where the code lives

| Layer | Path |
|-------|------|
| Types / validators | `src/lib/...` |
| DB / Prisma model | `prisma/schema.prisma` (model `...`) |
| Provider | `src/lib/...` |
| Service | `src/lib/...` |
| API routes | `src/app/api/...` |
| MCP tool(s) | `src/lib/mcp/...` |
| UI | `src/app/(app)/...`, `src/components/...` |
| Marketing copy | `src/lib/marketing-content.ts` |

## Data model

Prisma models touched, key fields, relationships. Note any uniqueness
constraints, soft deletes, or tenant scoping.

## Contracts

- API endpoints (method + path + Zod schema reference + key error codes from
  `withApi()`).
- MCP tools exposed (name + input schema + side effects).
- Webhooks consumed.

## Invariants

Things that must always be true. Examples:
- Open Banking calls are always read-only.
- Every line in a `MonthExpense` belongs to exactly one `Bank`.
- A user can have at most N active MCP tokens.

## Known gaps / TODOs

What we know is broken, missing, or hand-wavy. Be honest — the next agent will
read this.

## Related

- Design doc: `knowledge/design-docs/...`
- Skill: `.cursor/skills/.../SKILL.md`
