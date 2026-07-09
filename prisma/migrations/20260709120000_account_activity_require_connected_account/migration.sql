-- Every AccountActivity is written with a resolved connected account: ProcessRelationWebhookInteractor
-- looks the account up via findAccountByUnipileIdOrThrow and passes account.id, and the repo arg type is a
-- non-null string, so connectedAccountId is required in practice. Tighten the column to NOT NULL to match.
-- Defensively clear any orphaned account-less rows first (there should be none) so the narrowing never fails
-- on legacy data; such a row cannot be scoped to an account (accountActivityAccessWhere joins on it) and is
-- unusable. Idempotent: re-running the DELETE is a no-op once the column is NOT NULL.
DELETE FROM "AccountActivity" WHERE "connectedAccountId" IS NULL;

-- AlterTable
ALTER TABLE "AccountActivity" ALTER COLUMN "connectedAccountId" SET NOT NULL;
