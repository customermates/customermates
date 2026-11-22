DROP INDEX "ConnectedAccount_unipileAccountId_key";

CREATE UNIQUE INDEX "ConnectedAccount_companyId_unipileAccountId_key" ON "ConnectedAccount"("companyId", "unipileAccountId");

CREATE INDEX "ConnectedAccount_unipileAccountId_idx" ON "ConnectedAccount"("unipileAccountId");
