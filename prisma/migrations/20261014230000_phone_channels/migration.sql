-- Channels hold plain phone numbers: a record identity gets its own provider enum with "phone" next to the
-- messaging providers, so "phone" can never become a connectable messaging account. Re-running the file changes
-- nothing.
DO $$
BEGIN
  IF to_regtype('"RecordIdentityProvider"') IS NULL THEN
    CREATE TYPE "RecordIdentityProvider" AS ENUM ('google', 'outlook', 'mail', 'linkedin', 'whatsapp', 'instagram', 'telegram', 'phone');
  END IF;
END $$;

ALTER TABLE "RecordIdentity"
  ALTER COLUMN "provider" TYPE "RecordIdentityProvider" USING ("provider"::text::"RecordIdentityProvider");
