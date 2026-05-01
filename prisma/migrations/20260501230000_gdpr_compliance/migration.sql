-- GDPR compliance pass: demonstrable consent + public contact form.

-- 1. Demonstrable consent on `User` (Art. 7(1)). Both columns nullable so
--    legacy users keep working; the `(app)` layout guard redirects them to
--    `/accept-terms` before letting them in if either is null.
ALTER TABLE "User" ADD COLUMN "acceptedTermsAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "acceptedTermsVersion" TEXT;

-- 2. Contact message kind enum. Admin bandeja prioritises PRIVACY > ABUSE.
CREATE TYPE "ContactMessageKind" AS ENUM ('PRIVACY', 'ABUSE', 'BUG', 'GENERAL');

-- 3. Public contact form persistence. `userId` is SET NULL on user delete
--    so we keep the audit trail even if the requester closes their account.
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "kind" "ContactMessageKind" NOT NULL DEFAULT 'GENERAL',
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "userId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "readAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContactMessage_createdAt_idx" ON "ContactMessage"("createdAt");
CREATE INDEX "ContactMessage_kind_idx" ON "ContactMessage"("kind");
CREATE INDEX "ContactMessage_userId_idx" ON "ContactMessage"("userId");

ALTER TABLE "ContactMessage"
    ADD CONSTRAINT "ContactMessage_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
