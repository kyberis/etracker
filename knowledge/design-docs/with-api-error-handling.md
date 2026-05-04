# with-api-error-handling

## Problem

Every API route in Clara needs to translate three classes of errors into
JSON responses with a stable shape:

1. **Validation errors** from Zod (request body / query parsing).
2. **Business errors** ("user not found", "month not set up yet",
   "template already exists").
3. **Database errors** from Prisma (`P2002` unique violations, `P2025`
   missing-record, init / panic).
4. **Unhandled errors** (an SDK threw, a bug, the database is down).

Without a wrapper, every handler ends up writing the same boilerplate
`try / catch / map errors / return NextResponse.json` differently.
Worse, clients (web app, Telegram webhook, MCP servers, future agents)
get to play "guess the error shape" — sometimes a string, sometimes
an object, sometimes a 500 with HTML.

## Decision

Every API route body in Clara is wrapped in `withApi()`. Errors are
**thrown**, never returned. The wrapper maps:

| Thrown | HTTP response |
|--------|---------------|
| `ZodError` | `400 { error: <first issue message> }` |
| `Error("UNAUTHORIZED" | "FORBIDDEN" | "USER_NOT_FOUND" | "SOURCE_NOT_FOUND" | "NO_RECORD")` | mapped status from `BUSINESS_ERRORS` table |
| `Error` whose message includes `"Invalid month format"` | `400 "Month must be in yyyy-MM format."` |
| `PrismaClientKnownRequestError` `P2002` | `409 "Already exists."` |
| `PrismaClientKnownRequestError` `P2025` | `404 "Not found."` |
| `PrismaClientInitializationError` / `PrismaClientRustPanicError` | `500 "Could not connect to the database. Check DATABASE_URL."` |
| Anything else | `500 "Internal error."` (full error logged) |

Handlers may **also** return a `Response` directly (e.g. streaming
chat) — the wrapper passes it through untouched.

The implementation lives in
[`src/lib/http.ts`](../../src/lib/http.ts) — about 80 lines, no
surprises.

## Why this and not X

**Why not just `try / catch` per handler?** Boilerplate in 80+ routes,
shape drift, no single place to add structured logging. Every refactor
of "what does an API error look like?" turns into a sweep.

**Why not Next.js `error.tsx` boundaries?** Those work for the React
tree, not for `route.ts` API handlers. The wrapper is the JSON-API
sibling.

**Why throw `Error("UNAUTHORIZED")` strings instead of typed errors?**
Pragmatism. A tiny `BUSINESS_ERRORS` map keeps the surface explicit,
the throw site short (`throw new Error("USER_NOT_FOUND")`), and the
mapping centralised. A future `class ApiError` refactor would still
work — the wrapper would just match against its `code` instead of
`error.message`.

**Why support direct `Response` return?** The chat endpoint streams
via the AI SDK (`result.toAIStreamResponse()`); we need the wrapper
to honour that without re-wrapping.

## How to follow it

Every API handler looks like this:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi } from "@/lib/http";

const Body = z.object({ id: z.string() });

export async function POST(req: Request) {
  return withApi(async () => {
    const { id } = Body.parse(await req.json());
    const note = await db.note.findUnique({ where: { id } });
    if (!note) throw new Error("USER_NOT_FOUND");
    return { ok: true };
  });
}
```

Things to copy:

- Always wrap the **whole** body in `withApi`. The wrapper either
  serialises the return as JSON or returns the `Response` you handed
  back.
- Validate at the boundary with Zod. `Schema.parse(...)` throws a
  `ZodError` which the wrapper translates to `400`.
- Throw `new Error("CODE")` with one of the codes in
  `BUSINESS_ERRORS`. Adding a new business code = add a row to that
  map in [`src/lib/http.ts`](../../src/lib/http.ts), don't inline the
  shape.
- Catch Prisma uniqueness explicitly **only if** you want to translate
  it to a domain-specific message (otherwise the wrapper's `P2002 →
  409 "Already exists."` is fine).

Never `try { ... } catch { return NextResponse.json(...) }` inside a
route — the wrapper exists exactly so you don't.

## How to enforce it

- Code review: any `try / catch` inside a `route.ts` body that returns
  a `NextResponse` is a smell. Replace with a thrown business code or
  let it bubble to the wrapper.
- New handlers should exercise at least one error path (validation +
  one domain error) and assert the JSON envelope shape.
- A future ESLint rule could flag `try { ... } catch { ... return
  NextResponse.json` patterns. Not built today; review catches it.

## Open questions

- The `BUSINESS_ERRORS` map is a flat string table. As it grows (10+
  codes), consider promoting to a typed `ApiErrorCode` union so
  callers get auto-complete.
- The 500 envelope today exposes `"Internal error."` — generic on
  purpose. If we add a request id / correlation id, surface it here
  so users / support can quote it.
- We log the unhandled error with `console.error("[etracker.api]
  unhandled", error)` — fine for v1, but a structured logger
  (Sentry-ready) would scale better.

## Related

- [`core-beliefs`](core-beliefs.md) — "Errors flow through `withApi()`".
- [`.cursor/skills/engineer-data/SKILL.md`](../../.cursor/skills/engineer-data/SKILL.md)
  — "Throw typed errors and let `withApi()` translate them."
