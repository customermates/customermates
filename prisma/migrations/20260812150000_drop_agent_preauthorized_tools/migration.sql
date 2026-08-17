-- The assistant no longer offers "Approve always", so nothing writes or reads a
-- standing per-user tool authorisation. The column only ever held grants that
-- the product gave the user no way to review or withdraw.
ALTER TABLE "User" DROP COLUMN "preAuthorizedAgentTools";
