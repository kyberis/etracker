# LinkedIn — draft (EN) · Clara launch

> Target: personal launch post · origin story + tech · CTA at the end.

---

Say hello to Clara! 🎉

> You: "Paid rent today, $850"
> Clara: "Done — marked Rent as paid. You have $1,240 left for the month's pending expenses."

No spreadsheet. Just a conversation that understands PDFs, bank screenshots, and Telegram voice notes.

---

It all started with a Google Sheet. Fine on desktop, a pain on mobile. One day I asked myself: what if I just *told* a model what I spent?

That's how Clara was born. I made it open source because code is no longer the barrier — this kind of tool should be accessible to everyone.

Built 100% with Cursor and Claude Opus 4.7. One day of work. The process forced me to really understand what I actually needed.

---

What Clara is: a chat-first, MIT-licensed, self-hostable personal finance assistant. Rioplatense Spanish by default, English supported out of the box. Your data lives in your own Postgres — no telemetry, no "AI premium" upsell gate.

Why devs and AI engineers might care:

→ A real multimodal agent with 33 Zod-typed tools writing directly to Prisma — the model plans, calls tools, and stops at a step limit. Not a chat that "interprets" free text and leaves you to re-parse the output.

→ First-class MCP: public docs server (/api/mcp) + a per-user PAT-backed endpoint (/api/mcp/user) for Claude Desktop, Cursor, or any client — per-user rate limits and confirm: true on destructive calls, matching the web UI rules.

→ Telegram + AI Gateway: verified webhooks, photos, voice, PDFs, typing indicator; structured JSON logs with traceId, token counts, and estimated USD per turn for cost attribution.

---

Clara is the first agent in the trefolio.com ecosystem. It helps you become aware of your spending — the first step toward financial independence.

Warren is coming soon to help you manage your assets on trefolio.com 👀

---

You can use the hosted version with 30 free queries/day — more than enough to track a month's expenses.

Try it: clara.trefolio.com
Source: github.com/kyberis/etracker — if the approach resonates, a ⭐ goes a long way.

If you try it, I'd love your feedback via DM.

_(Suggested carousel: monthly dashboard → chat with "confirm before save" → MCP in Claude Desktop → README architecture diagram.)_
