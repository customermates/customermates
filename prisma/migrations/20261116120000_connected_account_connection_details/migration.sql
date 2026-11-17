ALTER TABLE "ConnectedAccount"
  ADD COLUMN "connectionDetails" JSONB,
  ADD COLUMN "statusCheckedAt" TIMESTAMP(3);
