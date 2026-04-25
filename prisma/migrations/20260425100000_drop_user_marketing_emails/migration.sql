-- Drop the unused marketing-emails opt-in column from User.
ALTER TABLE "User" DROP COLUMN IF EXISTS "marketingEmails";
