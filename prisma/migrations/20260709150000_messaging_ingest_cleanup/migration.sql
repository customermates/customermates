DROP INDEX "MessagingInboundEvent_accountId_idx";

ALTER TABLE "MessagingInboundEvent" DROP COLUMN "eventType";

ALTER TABLE "MessagingInboundEvent" DROP COLUMN "accountId";

CREATE INDEX "MessagingInboundEvent_source_processed_receivedAt_idx" ON "MessagingInboundEvent"("source", "processed", "receivedAt");

ALTER TABLE "ConnectedAccount" DROP COLUMN "providerSyncing";
