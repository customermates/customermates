-- Drop dead column + index from the polling-era webhook delivery queue.
-- With trigger.dev there's exactly one run per delivery and retries are
-- handled inside trigger.dev itself, so no worker-side advisory lock is
-- needed.

DROP INDEX IF EXISTS "WebhookDelivery_status_lockedAt_idx";

ALTER TABLE "WebhookDelivery" DROP COLUMN IF EXISTS "lockedAt";
