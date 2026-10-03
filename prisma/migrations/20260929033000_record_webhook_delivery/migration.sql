-- Existing delivery history stays intact. New writes bind delivery identity explicitly.
ALTER TABLE "WebhookDelivery"
  ADD COLUMN "webhookId" TEXT,
  ADD COLUMN "recordEventId" TEXT,
  ADD COLUMN "subscriptionRevision" INTEGER,
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);

-- Completed historical deliveries must not be automatically replayed.
UPDATE "WebhookDelivery" SET "nextAttemptAt" = NULL WHERE status IN ('success', 'failed');
CREATE UNIQUE INDEX "Webhook_companyId_id_key" ON "Webhook"("companyId", id);
CREATE UNIQUE INDEX "WebhookDelivery_companyId_webhookId_recordEventId_key" ON "WebhookDelivery"("companyId", "webhookId", "recordEventId");
CREATE INDEX "WebhookDelivery_companyId_webhookId_createdAt_idx" ON "WebhookDelivery"("companyId", "webhookId", "createdAt");
CREATE INDEX "WebhookDelivery_companyId_recordEventId_idx" ON "WebhookDelivery"("companyId", "recordEventId");
CREATE INDEX "WebhookDelivery_nextAttemptAt_status_idx" ON "WebhookDelivery"("nextAttemptAt", status);
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_companyId_webhookId_fkey" FOREIGN KEY ("companyId", "webhookId") REFERENCES "Webhook"("companyId", id) ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_companyId_recordEventId_fkey" FOREIGN KEY ("companyId", "recordEventId") REFERENCES "RecordEvent"("companyId", id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_record_revision_check" CHECK (("recordEventId" IS NULL AND "subscriptionRevision" IS NULL) OR ("recordEventId" IS NOT NULL AND "subscriptionRevision" > 0));
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_attempts_check" CHECK (attempts >= 0);
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_lease_check" CHECK (("leaseToken" IS NULL) = ("leaseExpiresAt" IS NULL));
ALTER TABLE "RecordEvent" ADD COLUMN "lastFailureCode" TEXT;
