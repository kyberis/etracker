-- Drop NextAuth tables that are unused with `session.strategy === "jwt"`
-- (see src/lib/auth.ts). Safe: with the JWT strategy, NextAuth never wrote
-- to these tables, so no application data is lost.

DROP TABLE IF EXISTS "Session";
DROP TABLE IF EXISTS "VerificationToken";
