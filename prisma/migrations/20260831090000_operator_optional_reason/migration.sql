-- Operator corrections are confirmed in place rather than justified in a free-text field,
-- so a credit adjustment may now record no reason. The audit trail already allowed NULL.
ALTER TABLE "AgentCreditAdjustment" ALTER COLUMN "reason" DROP NOT NULL;

ALTER TABLE "AgentCreditAdjustment"
  DROP CONSTRAINT "AgentCreditAdjustment_reason_valid";

ALTER TABLE "AgentCreditAdjustment"
  ADD CONSTRAINT "AgentCreditAdjustment_reason_valid" CHECK (
    "reason" IS NULL OR char_length(btrim("reason")) BETWEEN 1 AND 500
  );
