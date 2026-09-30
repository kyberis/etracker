# registration-approval

> New accounts cannot use Clara until an operator approves them.

## What it does

On trefolio.com the unified IdP (`user.trefolio.com`) is the security
boundary: unapproved users do not receive OIDC tokens, so they cannot
open Clara, Will, or the portfolio tracker.

When Clara runs without IdP OAuth (self-host / legacy Google + email),
`User.registrationApprovedAt` stays null on signup. The user can obtain a
session and sees `/pending-approval`. An operator clicks the signed link
in the signup-notify email (or uses `/admin`) to stamp the timestamp and
email the user that they can sign in.

`User.kind = GUEST` (event share-link) skips this gate.

`REGISTRATION_REQUIRES_APPROVAL=false` restores open signup.

## Where the code lives

| Layer | Path |
|-------|------|
| Types / helpers | `src/lib/registration-approval.ts` |
| DB | `User.registrationApprovedAt` in `prisma/schema.prisma` |
| Emails | `src/lib/signup-notify.ts`, `src/lib/registration-approved-email.ts` |
| Approve link | `src/app/api/auth/approve-registration/route.ts` |
| UI | `src/app/(auth)/pending-approval/page.tsx`, admin users table |
| Auth / proxy | `src/lib/auth.ts`, `src/proxy.ts` |

## Data model

- `User.registrationApprovedAt DateTime?` — null = pending.
- Existing rows are backfilled in `20260926010000_registration_approval`.

## Contracts

- `GET /api/auth/approve-registration?token=` — signed JWT capability, no admin session.
- `PATCH /api/admin/users/:id` `{ registrationApproved: true }`.

## Invariants

- Pending is not the same as `isActive = false` (soft-disable).
- IdP-on creates stamp `registrationApprovedAt` immediately because the
  IdP already approved the identity.
- GUEST accounts remain usable for the shared event without approval.

## Related

- Design doc: `knowledge/design-docs/unified-accounts-and-billing.md` (parent monorepo)
- Skill: `.cursor/skills/integration-trefolio-accounts/SKILL.md`
