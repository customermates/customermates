CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('pending', 'processing', 'success', 'failed');

ALTER TABLE "WebhookDelivery" ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "lockedAt" TIMESTAMP(3),
ADD COLUMN "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'pending';

UPDATE "WebhookDelivery"
SET
  "status" = CASE WHEN "success" THEN 'success'::"WebhookDeliveryStatus" ELSE 'failed'::"WebhookDeliveryStatus" END,
  "deliveredAt" = CASE WHEN "success" THEN "createdAt" ELSE NULL END;

CREATE INDEX "WebhookDelivery_status_lockedAt_idx" ON "WebhookDelivery"("status", "lockedAt");
CREATE INDEX "WebhookDelivery_companyId_createdAt_idx" ON "WebhookDelivery"("companyId", "createdAt");
