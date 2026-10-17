-- Drop the retired user country column; no code has read or written it since the previous release.
ALTER TABLE "User" DROP COLUMN IF EXISTS "country";
