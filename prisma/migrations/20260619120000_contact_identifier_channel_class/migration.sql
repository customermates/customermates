-- Add channelClass (nullable first so existing rows can be backfilled)
ALTER TABLE "ContactIdentifier" ADD COLUMN "channelClass" TEXT;

-- Backfill from provider: email-group -> 'email', whatsapp -> 'phone', handles keep their provider
UPDATE "ContactIdentifier" SET "channelClass" =
  CASE WHEN "provider" IN ('mail','google','outlook') THEN 'email'
       WHEN "provider" = 'whatsapp' THEN 'phone'
       ELSE "provider"::text END;

-- Defensive dedup before the class-scoped unique: keep the earliest row per (companyId, channelClass, value)
DELETE FROM "ContactIdentifier" a USING "ContactIdentifier" b
WHERE a."companyId" = b."companyId" AND a."channelClass" = b."channelClass" AND a."value" = b."value"
  AND (a."createdAt" > b."createdAt" OR (a."createdAt" = b."createdAt" AND a."id" > b."id"));

-- Enforce NOT NULL now that every row has a class
ALTER TABLE "ContactIdentifier" ALTER COLUMN "channelClass" SET NOT NULL;

-- Swap the per-provider unique for a class-scoped one (email/phone become provider-agnostic; handles keep platform)
DROP INDEX "ContactIdentifier_companyId_provider_value_key";
CREATE UNIQUE INDEX "ContactIdentifier_companyId_channelClass_value_key" ON "ContactIdentifier"("companyId", "channelClass", "value");

-- Drop unused enrichment columns. headline/occupation/pictureUrl were written from messaging
-- participants but never read off the identifier (every UI render reads the live MessagingAttendee;
-- the contact avatar is derived by recomputeContactAvatarUnscoped from the live
-- MessagingThreadParticipant into Contact.avatarUrl). displayName/profileUrl are kept (channel labels).
ALTER TABLE "ContactIdentifier" DROP COLUMN "headline";
ALTER TABLE "ContactIdentifier" DROP COLUMN "occupation";
ALTER TABLE "ContactIdentifier" DROP COLUMN "pictureUrl";
