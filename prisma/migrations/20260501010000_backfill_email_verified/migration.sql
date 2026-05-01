-- Email verification is now required for credential sign-in. Existing
-- credential users predate this rule and would be locked out unless we
-- grandfather them in: mark every existing credential row as verified
-- (NOW()) when it isn't already. Google rows are unaffected — Auth.js
-- already populates `emailVerified` on first Google sign-in, and any null
-- there is intentional (account row created but never finished sign-in).
UPDATE "User"
   SET "emailVerified" = NOW()
 WHERE "passwordHash" IS NOT NULL
   AND "emailVerified" IS NULL;
