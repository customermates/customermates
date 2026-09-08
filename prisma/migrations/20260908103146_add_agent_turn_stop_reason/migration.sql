-- AlterTable
ALTER TABLE "AgentTurnRequest" ADD COLUMN     "stopReason" TEXT;

ALTER TABLE "AgentTurnRequest"
ADD CONSTRAINT "AgentTurnRequest_stopReason_check"
CHECK (
  "stopReason" IS NULL OR
  "stopReason" IN (
    'credit_limit',
    'provider_error',
    'content_filter',
    'hosted_ai_unavailable',
    'cancelled',
    'turn_error',
    'policy_breach'
  )
);
