-- Account soft-delete. `User.deletedAt` is set to `now()` when the user
-- clicks "Borrar mi cuenta"; the daily `/api/cron/account-purge` cron
-- hard-deletes rows older than `ACCOUNT_DELETION_GRACE_DAYS` (30 days).
-- Until then the user can clear `deletedAt` from /account/restore.
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Partial index speeds up the cron's `WHERE deletedAt IS NOT NULL AND
-- deletedAt < cutoff` scan. Active rows (the 99.9% case) stay out of the
-- index so it costs nothing in steady-state writes.
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt") WHERE "deletedAt" IS NOT NULL;
