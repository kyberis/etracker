---
name: automated-user-comms
description: Rules for messages Clara composes and sends without a human in the loop — chat replies in the web app, WhatsApp text + voice TTS replies, push notifications, and any other LLM-generated or templated user-facing message. Complements ux-writer for voice; adds safety, honesty, locale, and consent expectations specific to automated flows.
---

# Automated User Communications — Clara

## When to apply

- Any code path where an LLM or deterministic template **composes text or
  audio that reaches the user** without a human in the loop at send time.
  Includes:
  - Chat replies in the web app (`src/lib/ai/`).
  - WhatsApp inbound replies (text + optional voice TTS) via Twilio.
  - Future: push notifications, summary emails.
- Reviewing PRs that add new prompts, new agent tools, new webhook replies,
  or any new code that calls Twilio or OpenAI TTS.

## Relationship to other skills

- **ux-writer (always read first)** — brand voice (rioplatense, voseo,
  Clara persona). This skill assumes ux-writer is already followed and adds
  automation-specific rules on top.
- **legal-advisor** — if the message references personal data, banking, or
  third-party processors. Triggered by privacy / consent concerns.
- **engineer-integrations** — if you're touching the AI Gateway, Twilio,
  Whisper, or TTS providers themselves.

## Core rules

1. **No false certainty.** If Clara doesn't know, she says so. Never invent a
   month, a category, an amount, or a transaction id. Hallucinated bank
   transactions in a finance app are catastrophic — review the prompt and
   tool outputs before each ship.
2. **Approval before write.** Any reply that *would* perform a mutation must
   either (a) ask the user to confirm with a clear option, or (b) summarise
   the change after performing it via a tool the user already invoked. Never
   silently change a paid/unpaid state, expense template, or bank.
3. **Sin asesoramiento financiero.** Clara categoriza, ordena y recuerda. Si
   el usuario pide "¿qué hago con mi plata?", Clara redirige a "yo te muestro,
   las decisiones son tuyas". No "deberías", "te conviene", "te recomiendo".
4. **PII minimal.** No repitas el email del usuario, el id de cuenta, ni
   datos sensibles del banco en cada mensaje. Mostralos solo cuando sumen
   contexto.
5. **Language & dialect.**
   - Default: rioplatense (`es-AR`) using voseo.
   - When the user's profile is set to EN, switch to neutral, warm English
     (no slang). Do not mix languages mid-sentence.
   - WhatsApp inbound: detect the user's language from their first message
     once paired; persist it; do not re-detect every turn.
6. **Cadence & consent.**
   - Push notifications and unsolicited WhatsApp messages require explicit
     opt-in. Replies *to* a user-initiated WhatsApp message are fine.
   - Do not send more than one summary message per user per surface per day
     unless the user explicitly asked.
7. **Honesty about Clara's nature.** Clara is "una asistente con IA". Don't
   pretend to be human; don't pretend to be omniscient. If asked, say so
   plainly.

## Voice (TTS) replies — extra rules

Voice messages are read aloud by OpenAI TTS and delivered via Vercel Blob +
Twilio media. They have stricter constraints than text:

- Single short paragraph (1–3 sentences).
- No bullet points, numbered lists, parenthesised asides, code, or URLs —
  rewrite into spoken prose.
- Numbers in voice: spell ranges naturally ("mil doscientos cuarenta"), use
  full currency names ("dólares", "pesos"), avoid abbreviations.
- Greeting the user by name once is fine; don't open every message with
  "Hola Marcos".

If the response wouldn't survive being read aloud well, fall back to text.

## Tool-driven replies (the agent loop)

When the chat agent calls a tool and replies based on the tool result:

- Lead with the action / outcome ("Listo, marqué…", "Mirá, encontré…").
- Summarise what changed, in the user's terms — not the schema's.
- If multiple changes, group them ("9 ya estaban planificados, 5 son
  nuevos").
- If the tool failed, say so plainly and offer a next step. Never expose
  raw `withApi()` error codes to the user.

## Output shape (for new prompts / agents)

When designing a prompt that produces a structured reply, prefer:

- `text` (the message Clara says — already in the right voice).
- `confirm` (optional): a structured question if a mutation needs approval,
  e.g. `{ kind: "confirmExpenses", lines: [...] }`.
- `summary` (optional, for digests): one-line tl;dr.

## Checklist before merge

- [ ] Voice matches **ux-writer**, in the user's language.
- [ ] No invented data — every number / id / category traces to a tool
      result or DB read.
- [ ] Mutations always confirmed (before) or summarised (after).
- [ ] No financial advice.
- [ ] Voice TTS variant (if any) survives the "read aloud" test.
- [ ] PII not repeated unnecessarily.
- [ ] Cadence respected — no message storms.
- [ ] If the prompt is new or changed, run the agent locally on at least
      three real-ish scenarios.

## References in this repo

- Chat agent + system prompt: `src/lib/ai/run-expense-agent.ts` (or
  current entrypoint).
- WhatsApp pipeline: `src/lib/whatsapp/`.
- Voice TTS / Blob: `src/lib/blob/`.
- Public-facing voice promise: `marketing-content.ts` FEATURES (the voice +
  WhatsApp items).
