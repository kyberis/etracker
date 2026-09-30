-- AlterTable
ALTER TABLE "User" ADD COLUMN "registrationApprovedAt" TIMESTAMP(3);

-- Backfill existing regular accounts so nobody is locked out.
UPDATE "User"
SET "registrationApprovedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP)
WHERE "registrationApprovedAt" IS NULL;
