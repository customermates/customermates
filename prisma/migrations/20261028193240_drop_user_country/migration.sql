-- Drop the retired user country column after removing its remaining consumers.
ALTER TABLE "User" DROP COLUMN IF EXISTS "country";
