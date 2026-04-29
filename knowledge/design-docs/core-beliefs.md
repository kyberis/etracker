# core-beliefs

A handful of non-negotiable principles. Everything else is negotiable.

## 1. The repo is the memory

All durable knowledge lives in the repository. Agents should never need to read
external context, notebooks, or ask for tribal knowledge.

- Adding a user-facing feature means updating `knowledge/product-specs/` AND
  `src/lib/marketing-content.ts` (CHANGELOG + relevant marketing copy) AND
  (if relevant) the public landing.
- The CHANGELOG in `marketing-content.ts` is the single source of truth — it
  feeds both the public `/changelog` page and the JSON-LD that AI crawlers
  index. There is no parallel `release-notes.ts`.

## 2. Rioplatense voice is the product

Clara habla rioplatense. No es decoración: es el producto.

- Sin tuteo. Sin "tú". Voseo natural ("vos pagaste", "decime", "mirá").
- Sin inglés corporativo, sin sermones, sin disclaimers de banco.
- Sin emojis decorativos en respuestas del agente. Los emojis tienen que
  agregar información (✅ pagado, ⚠️ atención).
- Tono: amiga contadora que sabe lo que hace. Directa, cálida, breve.
- See [`.cursor/skills/ux-writer/SKILL.md`](../../.cursor/skills/ux-writer/SKILL.md).

When EN copy exists alongside ES (marketing pages, llms.txt, MCP descriptions),
the EN is a faithful translation, not a different voice.

## 3. Chat-first, UI second

A new capability lands as an agent tool first whenever it can. The UI for it
follows. This keeps the "talk to your money" promise real.

- Tools live in [`src/lib/ai/`](../../src/lib/ai) and the per-user MCP server.
- A capability that exists only in UI but not as a tool should be flagged in
  the spec as a known gap.

## 4. Open Banking is read-only

Clara never has access to the user's money. GoCardless integration is **only**
for read-only transaction sync. Any future code path that even *looks* like a
write to a bank account is rejected at review.

## 5. Errors flow through `withApi()`

Route handlers stay tiny. Mapping Zod / Prisma / business errors to HTTP
responses is centralised in [`src/lib/http.ts`](../../src/lib/http.ts). Never
`try/catch + rethrow` in handlers.

## 6. AI calls go through the Gateway

For chat and classification, models are referenced as `provider/model`
strings via the Vercel AI SDK + AI Gateway. Direct `OPENAI_API_KEY` calls are
allowed only for OpenAI-only products (Whisper transcription, TTS audio).

This is what gives us model failover, cost tracking, and the ability to swap
providers via env without touching code.

## 7. MCP is a first-class surface

Anything a logged-in user can do is candidate for the per-user MCP server. The
server is a thin wrapper around services — it never duplicates business logic
and never bypasses auth. Tokens are sha-256 hashed, expirable, revocable.

## 8. Self-hostable by default

Every optional integration (AI Gateway, Blob, Runtime Cache, GoCardless,
Twilio, Sentry) must degrade gracefully when its env vars are missing. The MIT
license + self-host story is core to Clara's positioning.

## 9. Tests for pure functions

Anything in `src/lib/**/*.ts` that does not touch the DB should have a Vitest
unit test. Pure functions are cheap to test and prevent the kind of drift that
turns a chat agent into a liar.

## 10. Privacy is not negotiable

No telemetry. No tracking. No third-party analytics that profile users. PII
never appears in logs. AI prompts that include user data must be scrubbable
and never sent to a non-Gateway provider.

## Related

- [`AGENTS.md`](../../AGENTS.md)
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md)
- [`.cursor/rules/`](../../.cursor/rules)
