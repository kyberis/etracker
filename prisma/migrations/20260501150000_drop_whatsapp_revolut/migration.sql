-- Drop the WhatsApp Assistant and Revolut (Open Banking) features.
-- Both integrations are removed from the product; this migration cleans
-- up the now-orphaned tables and User columns.

-- Revolut / GoCardless tables (drop child first to satisfy FK)
DROP TABLE IF EXISTS "IgnoredTransaction";
DROP TABLE IF EXISTS "RevolutConnection";

-- WhatsApp conversation history
DROP TABLE IF EXISTS "WhatsappMessage";

-- WhatsApp link fields on User
ALTER TABLE "User" DROP COLUMN IF EXISTS "whatsappLinkCodeExpires";
ALTER TABLE "User" DROP COLUMN IF EXISTS "whatsappLinkCode";
ALTER TABLE "User" DROP COLUMN IF EXISTS "whatsappVerifiedAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "whatsappPhone";
