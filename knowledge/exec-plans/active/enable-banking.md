# Enable Banking (Open Banking)

> Greenfield PSD2 integration for Clara. Sandbox first, then restricted
> production with the operator's own accounts.

## Status

Implementation landed in-repo. Remaining ops: register the Enable Banking
app, set Vercel env vars, turn on the `open_banking` feature flag.

## Todos

- [x] Clean stale Revolut/GoCardless marketing + comments
- [x] Provider module + JWT + Zod schemas
- [x] Prisma models + migration
- [x] OAuth connect/callback
- [x] Sync + import into month lines
- [x] Settings UI
- [x] Cron + log prune
- [x] Admin observability
- [x] Tests + spec + changelog + privacy bump
