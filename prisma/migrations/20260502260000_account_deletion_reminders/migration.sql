-- Track which soft-delete reminder emails have been sent to a given user
-- so the daily `/api/cron/account-purge` cron stays idempotent across
-- reruns. Bit 0 = T-7 reminder, bit 1 = T-1 reminder. The column is
-- reset to 0 by `/api/account/restore` when the user clears `deletedAt`.
ALTER TABLE "User"
  ADD COLUMN "deletionRemindersSent" INTEGER NOT NULL DEFAULT 0;
