-- AlterTable
ALTER TABLE "User"
ADD COLUMN "isPlatformOperator" BOOLEAN NOT NULL DEFAULT false;

-- Enterprise allowances remain optional so an unconfigured account can fail closed in the
-- application, but a configured allowance must be finite and positive.
ALTER TABLE "Subscription"
ADD CONSTRAINT "Subscription_enterprise_agent_credits_valid" CHECK (
  "enterpriseAgentCreditsPerUser" IS NULL
  OR "enterpriseAgentCreditsPerUser" BETWEEN 1 AND 1000000
);

-- CreateTable
CREATE TABLE "AgentCreditAdjustment" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "creditDelta" INTEGER NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "operationId" TEXT NOT NULL,
  "createdByOperatorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentCreditAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorAuditEvent" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetCompanyId" TEXT,
  "targetUserId" TEXT,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OperatorAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentCreditAdjustment_operationId_key" ON "AgentCreditAdjustment"("operationId");

-- CreateIndex
CREATE INDEX "AgentCreditAdjustment_period_lookup_idx"
ON "AgentCreditAdjustment"("companyId", "userId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "AgentCreditAdjustment_companyId_createdAt_idx"
ON "AgentCreditAdjustment"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "OperatorAuditEvent_action_createdAt_idx" ON "OperatorAuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "OperatorAuditEvent_targetCompanyId_createdAt_idx"
ON "OperatorAuditEvent"("targetCompanyId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentUsageEvent_state_settledAt_createdAt_idx"
ON "AgentUsageEvent"("state", "settledAt", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentCreditAdjustment"
ADD CONSTRAINT "AgentCreditAdjustment_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCreditAdjustment"
ADD CONSTRAINT "AgentCreditAdjustment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Operational invariants Prisma cannot express in its datamodel.
ALTER TABLE "AgentCreditAdjustment"
  ADD CONSTRAINT "AgentCreditAdjustment_delta_bounded_nonzero" CHECK (
    "creditDelta" BETWEEN -1000000 AND 1000000 AND "creditDelta" <> 0
  ),
  ADD CONSTRAINT "AgentCreditAdjustment_period_ordered" CHECK ("periodEnd" > "periodStart"),
  ADD CONSTRAINT "AgentCreditAdjustment_reason_valid" CHECK (
    "reason" IS NULL OR char_length(btrim("reason")) BETWEEN 1 AND 500
  ),
  ADD CONSTRAINT "AgentCreditAdjustment_operation_id_valid" CHECK (
    char_length(btrim("operationId")) BETWEEN 1 AND 200
  ),
  ADD CONSTRAINT "AgentCreditAdjustment_actor_id_valid" CHECK (
    "createdByOperatorUserId" IS NULL OR char_length(btrim("createdByOperatorUserId")) BETWEEN 1 AND 200
  );

ALTER TABLE "OperatorAuditEvent"
  ADD CONSTRAINT "OperatorAuditEvent_actor_id_valid" CHECK (
    char_length(btrim("actorUserId")) BETWEEN 1 AND 200
  ),
  ADD CONSTRAINT "OperatorAuditEvent_action_valid" CHECK (
    char_length(btrim("action")) BETWEEN 1 AND 200
  ),
  ADD CONSTRAINT "OperatorAuditEvent_reason_valid" CHECK (
    "reason" IS NULL OR char_length(btrim("reason")) BETWEEN 1 AND 500
  );
