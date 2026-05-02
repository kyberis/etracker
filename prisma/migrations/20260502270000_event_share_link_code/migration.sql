-- Follow-up to `20260502230000_shared_event_wallets`. The original
-- migration shipped without the bits the share-link landing actually
-- needs to mint Telegram deep-links for fresh GUEST accounts. Add them
-- here in an additive, idempotent block:
--
-- * `EventParticipant.telegramLinkCode` — single-use short code that
--   the bot's `/start <code>` matches against to bind Telegram identity
--   to the GUEST user. Cleared (set to null) once consumed.
-- * `EventParticipant_telegramLinkCode_key` — unique index so the
--   webhook lookup is O(1) and we never accept a colliding code.
-- * `EventParticipant_eventId_idx` — speeds up the per-event "show me
--   the roster" query the participants list endpoint runs on every
--   page load.
-- * `EventShareToken_createdById_idx` — supports the admin / dashboard
--   "tokens this user minted" view.

ALTER TABLE "EventParticipant"
  ADD COLUMN "telegramLinkCode" TEXT;

CREATE UNIQUE INDEX "EventParticipant_telegramLinkCode_key"
  ON "EventParticipant"("telegramLinkCode");

CREATE INDEX "EventParticipant_eventId_idx"
  ON "EventParticipant"("eventId");

CREATE INDEX "EventShareToken_createdById_idx"
  ON "EventShareToken"("createdById");
