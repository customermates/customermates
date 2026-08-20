-- CreateEnum
CREATE TYPE "AgentUsageState" AS ENUM ('reserved', 'settled', 'retained', 'released');

-- CreateEnum
CREATE TYPE "AgentTurnStatus" AS ENUM ('running', 'completed', 'failed', 'uncertain');

-- CreateEnum
CREATE TYPE "AgentTurnTerminalCode" AS ENUM ('completed', 'partial', 'error', 'cancelled', 'policyBreach');

-- CreateEnum
CREATE TYPE "AgentMessageRole" AS ENUM ('user', 'assistant');

-- CreateEnum
CREATE TYPE "AgentApprovalDecision" AS ENUM ('approve', 'reject');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "agentCreditAnchorAt" TIMESTAMP(3),
ADD COLUMN     "enterpriseAgentCreditsPerUser" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "agentCreditActivatedAt" TIMESTAMP(3);

-- Seats that already exist when this ships have never been stamped, and an unstamped seat reads as
-- "no subscription" to the credit policy. Without this, every current paying user would be told to
-- buy a subscription they already have. Their seat became active when the user was created, which is
-- at or before the current credit period for anyone who is not brand new, so they get a full
-- allowance; a seat created mid-period keeps the same proration a new seat gets today.
UPDATE "User" SET "agentCreditActivatedAt" = "createdAt" WHERE "status" = 'active';

-- CreateTable
CREATE TABLE "AgentConversation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "archivedAt" TIMESTAMP(3),
    "selectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "turnRequestId" TEXT,
    "role" "AgentMessageRole" NOT NULL,
    "parts" JSONB NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentUsageEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "state" "AgentUsageState" NOT NULL DEFAULT 'reserved',
    "model" TEXT NOT NULL DEFAULT '',
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicrocents" INTEGER NOT NULL DEFAULT 0,
    "reservedCredits" INTEGER NOT NULL DEFAULT 0,
    "chargedCredits" INTEGER NOT NULL DEFAULT 0,
    "policyBreach" BOOLEAN NOT NULL DEFAULT false,
    "planSnapshot" "SubscriptionPlan" NOT NULL,
    "subscriptionStatusSnapshot" "SubscriptionStatus" NOT NULL,
    "allowanceCreditsSnapshot" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "providerStartedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTurnRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "pageRoute" TEXT,
    "status" "AgentTurnStatus" NOT NULL,
    "runId" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "providerStartedAt" TIMESTAMP(3),
    "userMessageId" TEXT NOT NULL,
    "assistantMessageId" TEXT,
    "terminalCode" "AgentTurnTerminalCode",
    "affectedResources" JSONB NOT NULL DEFAULT '[]',
    "terminalAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTurnRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentApproval" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "decision" "AgentApprovalDecision" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentUiCommandResult" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentUiCommandResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRunLease" (
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRunLease_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "AgentConversation_companyId_userId_archivedAt_updatedAt_idx" ON "AgentConversation"("companyId", "userId", "archivedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "AgentConversation_companyId_userId_archivedAt_selectedAt_idx" ON "AgentConversation"("companyId", "userId", "archivedAt", "selectedAt");

-- CreateIndex
CREATE INDEX "AgentMessage_conversationId_role_sequence_idx" ON "AgentMessage"("conversationId", "role", "sequence");

-- CreateIndex
CREATE INDEX "AgentMessage_companyId_idx" ON "AgentMessage"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentMessage_conversationId_sequence_key" ON "AgentMessage"("conversationId", "sequence");

-- CreateIndex
CREATE INDEX "AgentUsageEvent_userId_createdAt_idx" ON "AgentUsageEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentUsageEvent_companyId_createdAt_idx" ON "AgentUsageEvent"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentUsageEvent_companyId_userId_periodStart_periodEnd_stat_idx" ON "AgentUsageEvent"("companyId", "userId", "periodStart", "periodEnd", "state");

-- CreateIndex
CREATE INDEX "AgentTurnRequest_companyId_userId_runId_status_idx" ON "AgentTurnRequest"("companyId", "userId", "runId", "status");

-- CreateIndex
CREATE INDEX "AgentTurnRequest_conversationId_companyId_userId_status_idx" ON "AgentTurnRequest"("conversationId", "companyId", "userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTurnRequest_companyId_userId_clientRequestId_key" ON "AgentTurnRequest"("companyId", "userId", "clientRequestId");

-- CreateIndex
CREATE INDEX "AgentApproval_companyId_idx" ON "AgentApproval"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentApproval_conversationId_requestId_key" ON "AgentApproval"("conversationId", "requestId");

-- CreateIndex
CREATE INDEX "AgentUiCommandResult_companyId_idx" ON "AgentUiCommandResult"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentUiCommandResult_companyId_conversationId_commandId_key" ON "AgentUiCommandResult"("companyId", "conversationId", "commandId");

-- CreateIndex
CREATE INDEX "AgentRunLease_companyId_idx" ON "AgentRunLease"("companyId");

-- CreateIndex
CREATE INDEX "AgentRunLease_expiresAt_idx" ON "AgentRunLease"("expiresAt");

-- AddForeignKey
ALTER TABLE "AgentConversation" ADD CONSTRAINT "AgentConversation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentConversation" ADD CONSTRAINT "AgentConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_turnRequestId_fkey" FOREIGN KEY ("turnRequestId") REFERENCES "AgentTurnRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentUsageEvent" ADD CONSTRAINT "AgentUsageEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTurnRequest" ADD CONSTRAINT "AgentTurnRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTurnRequest" ADD CONSTRAINT "AgentTurnRequest_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentApproval" ADD CONSTRAINT "AgentApproval_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentApproval" ADD CONSTRAINT "AgentApproval_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentUiCommandResult" ADD CONSTRAINT "AgentUiCommandResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentUiCommandResult" ADD CONSTRAINT "AgentUiCommandResult_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRunLease" ADD CONSTRAINT "AgentRunLease_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRunLease" ADD CONSTRAINT "AgentRunLease_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Money invariants. Prisma cannot model CHECK constraints, so `prisma db push --force-reset`
-- on the local reset path drops these; they protect the migrate-deploy path, and the
-- application enforces the same rules independently.
ALTER TABLE "AgentUsageEvent"
  ADD CONSTRAINT "AgentUsageEvent_amounts_nonnegative" CHECK (
    "reservedCredits" >= 0 AND "chargedCredits" >= 0 AND "allowanceCreditsSnapshot" >= 0
    AND "inputTokens" >= 0 AND "outputTokens" >= 0 AND "cacheReadTokens" >= 0
    AND "cacheWriteTokens" >= 0 AND "costMicrocents" >= 0
  ),
  ADD CONSTRAINT "AgentUsageEvent_charge_within_reservation" CHECK ("chargedCredits" <= "reservedCredits"),
  ADD CONSTRAINT "AgentUsageEvent_period_ordered" CHECK ("periodEnd" >= "periodStart"),
  ADD CONSTRAINT "AgentUsageEvent_reserved_state_unsettled" CHECK (
    "state" <> 'reserved' OR ("settledAt" IS NULL AND "chargedCredits" = 0)
  ),
  ADD CONSTRAINT "AgentUsageEvent_terminal_state_settled" CHECK (
    "state" = 'reserved' OR "settledAt" IS NOT NULL
  ),
  ADD CONSTRAINT "AgentUsageEvent_released_state_uncharged" CHECK (
    "state" <> 'released' OR "chargedCredits" = 0
  );

ALTER TABLE "AgentTurnRequest"
  ADD CONSTRAINT "AgentTurnRequest_attempt_count_positive" CHECK ("attemptCount" >= 1);
