-- Keep automatic admission unique while allowing an explicit resend to have
-- its own delivery history and to recheck current access before every send.
ALTER TABLE "WebhookDelivery" ADD COLUMN "admissionKey" TEXT;
UPDATE "WebhookDelivery"
SET "admissionKey" = "webhookId" || ':' || "recordEventId"
WHERE "webhookId" IS NOT NULL AND "recordEventId" IS NOT NULL;
DROP INDEX "WebhookDelivery_companyId_webhookId_recordEventId_key";
CREATE UNIQUE INDEX "WebhookDelivery_companyId_admissionKey_key"
  ON "WebhookDelivery"("companyId", "admissionKey");
