-- Add locale preference to User. Default to "es" so existing rows stay
-- on Spanish. The chat-driven setUserLocale tool, the menu switcher and
-- the /api/settings/locale endpoint all write to this column.
ALTER TABLE "User" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'es';
