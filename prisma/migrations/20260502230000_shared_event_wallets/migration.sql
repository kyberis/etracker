-- Shared event wallets — additive migration that introduces:
--
-- * `UserKind` enum (REGULAR | GUEST). Existing users are REGULAR.
-- * `EventParticipantRole` enum (OWNER | GUEST).
-- * `EventParticipant` join table — the owner gets a backfilled OWNER row for
--   every existing event so downstream code can treat all events uniformly
--   (anyone with an EventParticipant row can read/edit; only OWNER can mint
--   share-tokens, remove participants, or delete the event).
-- * `EventShareToken` — stateful share tokens (sha256 hash only, never the
--   plaintext) so we can revoke + observe last-used timestamps and a cron
--   can purge expired ones.
-- * `MonthExpenseLine.paidByUserId` — who actually paid this line. Null for
--   legacy / non-shared events; required by the AI tool when the event has
--   more than one active participant so `computeSettlement` is correct.
--
-- This file was reconstructed locally from the dev DB (the original
-- file was never committed). The follow-up migration
-- `20260502270000_event_share_link_code` adds the `telegramLinkCode`
-- column, the `EventParticipant_eventId_idx` and the
-- `EventShareToken_createdById_idx` that this initial migration missed.

-- 1. Enums ---------------------------------------------------------------

CREATE TYPE "UserKind" AS ENUM ('REGULAR', 'GUEST');
CREATE TYPE "EventParticipantRole" AS ENUM ('OWNER', 'GUEST');

-- 2. User.kind -----------------------------------------------------------

ALTER TABLE "User"
  ADD COLUMN "kind" "UserKind" NOT NULL DEFAULT 'REGULAR';

-- 3. MonthExpenseLine.paidByUserId --------------------------------------

ALTER TABLE "MonthExpenseLine"
  ADD COLUMN "paidByUserId" TEXT;

ALTER TABLE "MonthExpenseLine"
  ADD CONSTRAINT "MonthExpenseLine_paidByUserId_fkey"
  FOREIGN KEY ("paidByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MonthExpenseLine_paidByUserId_idx"
  ON "MonthExpenseLine"("paidByUserId");

-- 4. EventParticipant ---------------------------------------------------

CREATE TABLE "EventParticipant" (
  "id"          TEXT NOT NULL,
  "eventId"     TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "role"        "EventParticipantRole" NOT NULL,
  "displayName" TEXT NOT NULL,
  "joinedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedAt"   TIMESTAMP(3),
  CONSTRAINT "EventParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventParticipant_eventId_userId_key"
  ON "EventParticipant"("eventId", "userId");
CREATE INDEX "EventParticipant_userId_idx" ON "EventParticipant"("userId");

ALTER TABLE "EventParticipant"
  ADD CONSTRAINT "EventParticipant_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventParticipant"
  ADD CONSTRAINT "EventParticipant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. EventShareToken ----------------------------------------------------

CREATE TABLE "EventShareToken" (
  "id"          TEXT NOT NULL,
  "eventId"     TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "tokenHash"   TEXT NOT NULL,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "revokedAt"   TIMESTAMP(3),
  "lastUsedAt"  TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventShareToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventShareToken_tokenHash_key"
  ON "EventShareToken"("tokenHash");
CREATE INDEX "EventShareToken_eventId_idx" ON "EventShareToken"("eventId");

ALTER TABLE "EventShareToken"
  ADD CONSTRAINT "EventShareToken_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventShareToken"
  ADD CONSTRAINT "EventShareToken_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Backfill OWNER participant rows for every existing Event ----------

INSERT INTO "EventParticipant" (
  "id", "eventId", "userId", "role", "displayName", "joinedAt"
)
SELECT
  ('owner_' || gen_random_uuid()::text)::text,
  e."id",
  e."userId",
  'OWNER',
  COALESCE(NULLIF(u."name", ''), u."email"),
  e."createdAt"
FROM "Event" e
JOIN "User" u ON u."id" = e."userId";
