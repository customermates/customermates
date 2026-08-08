-- CreateEnum
CREATE TYPE "AgentUsageState" AS ENUM ('reserved', 'settled', 'retained', 'released');

-- CreateEnum
CREATE TYPE "AgentTurnStatus" AS ENUM ('running', 'completed', 'failed', 'uncertain');

-- CreateEnum
CREATE TYPE "AgentTurnTerminalCode" AS ENUM ('completed', 'partial', 'error', 'cancelled', 'policyBreach');

-- CreateEnum
CREATE TYPE "AgentWorkspaceSetupStatus" AS ENUM ('applied', 'partiallyCleaned', 'cleaned');

-- CreateEnum
CREATE TYPE "AgentSetupResourceKind" AS ENUM ('customColumn', 'organization', 'contact', 'service', 'deal', 'task', 'widget');

-- CreateEnum
CREATE TYPE "AgentSetupResourceStatus" AS ENUM ('active', 'retained', 'deleted', 'missing');

-- CreateEnum
CREATE TYPE "AgentSetupCleanupReason" AS ENUM ('edited', 'dependent');

-- DropIndex
DROP INDEX "AgentConversation_companyId_userId_updatedAt_idx";

-- DropIndex
DROP INDEX "AgentConversation_companyId_userId_key";

-- DropIndex
DROP INDEX "AgentMessage_conversationId_createdAt_idx";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "agentCreditActivatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "agentCreditAnchorAt" TIMESTAMP(3),
ADD COLUMN     "enterpriseAgentCreditsPerUser" INTEGER;

-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "agentConversationId" TEXT;

-- AlterTable
ALTER TABLE "AgentConversation" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "selectedAt" TIMESTAMP(3),
ADD COLUMN     "userLastReadSequence" BIGINT;

-- Backfill selectedAt. Reads order by selectedAt DESC and PostgreSQL sorts NULL first
-- under DESC, so a never-selected legacy conversation would outrank a just-used one.
UPDATE "AgentConversation" SET "selectedAt" = "updatedAt" WHERE "selectedAt" IS NULL;

-- AlterTable
ALTER TABLE "AgentMessage" ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sequence" BIGSERIAL NOT NULL,
ADD COLUMN     "turnRequestId" TEXT;

-- Backfill searchText from the visible text parts. The application derives this column
-- through sanitizeAgentVisibleText, whose full rule set cannot be reproduced faithfully in
-- SQL, so this backfill fails closed: any legacy row still carrying a private marker after
-- extraction is blanked and becomes unsearchable rather than searchable-but-leaking.
UPDATE "AgentMessage" m
SET "searchText" = COALESCE((
  SELECT string_agg(part->>'text', E'\n' ORDER BY ord)
  FROM jsonb_array_elements(m."parts") WITH ORDINALITY AS elements(part, ord)
  WHERE part->>'type' = 'text' AND jsonb_typeof(part->'text') = 'string'
), '')
WHERE jsonb_typeof(m."parts") = 'array';

UPDATE "AgentMessage"
SET "searchText" = ''
WHERE "searchText" ~* '(</?(page_context|analysis|reasoning|think|thinking|internal_reasoning)\M|&lt;/?(page_context|analysis|reasoning|think|thinking|internal_reasoning)\M|```[[:space:]]*(analysis|reasoning|thinking|chain[-_ ]of[-_ ]thought|internal)\M|-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----)';

UPDATE "AgentMessage"
SET "searchText" = regexp_replace(
  regexp_replace(
    regexp_replace(
      regexp_replace("searchText", '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '[redacted]', 'gi'),
      '(sk|ghp|gho|ghs|xox[abprs]|AKIA|AIza)[-_a-zA-Z0-9]{8,}', '[redacted]', 'g'),
    'eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}', '[redacted]', 'g'),
  '(authorization|cookie|api[-_]?key|password|secret|token)[[:space:]]*[:=][[:space:]]*[^[:space:]]+', '[redacted]', 'gi')
WHERE "searchText" <> '';

UPDATE "AgentMessage" SET "searchText" = btrim("searchText");

ALTER TABLE "AgentMessage" ALTER COLUMN "searchText" DROP DEFAULT;

-- Renumber sequence deterministically. A bare BIGSERIAL assigns values in heap order, which
-- is not reproducible and would make the transcript order depend on physical row layout.
-- This must run before the unique index below.
WITH ordered AS (
  SELECT "id", row_number() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "AgentMessage"
)
UPDATE "AgentMessage" m
SET "sequence" = ordered.rn
FROM ordered
WHERE m."id" = ordered."id";

SELECT setval(
  pg_get_serial_sequence('"AgentMessage"', 'sequence'),
  COALESCE((SELECT MAX("sequence") FROM "AgentMessage"), 0) + 1,
  false
);

-- Backfill userLastReadSequence from the legacy userLastReadAt timestamp.
UPDATE "AgentConversation" c
SET "userLastReadSequence" = (
  SELECT MAX(m."sequence")
  FROM "AgentMessage" m
  WHERE m."conversationId" = c."id" AND m."createdAt" <= c."userLastReadAt"
)
WHERE c."userLastReadAt" IS NOT NULL;

-- AlterTable
ALTER TABLE "AgentUsageEvent" ADD COLUMN     "allowanceCreditsSnapshot" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "chargedCredits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "periodEnd" TIMESTAMP(3) NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
ADD COLUMN     "periodStart" TIMESTAMP(3) NOT NULL DEFAULT TIMESTAMP '1970-01-01 00:00:00',
ADD COLUMN     "planSnapshot" "SubscriptionPlan" NOT NULL DEFAULT 'pro',
ADD COLUMN     "policyBreach" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "providerStartedAt" TIMESTAMP(3),
ADD COLUMN     "reservedCredits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "settledAt" TIMESTAMP(3),
ADD COLUMN     "state" "AgentUsageState" NOT NULL DEFAULT 'reserved',
ADD COLUMN     "subscriptionStatusSnapshot" "SubscriptionStatus" NOT NULL DEFAULT 'trial',
ALTER COLUMN "model" SET DEFAULT '',
ALTER COLUMN "inputTokens" SET DEFAULT 0,
ALTER COLUMN "outputTokens" SET DEFAULT 0,
ALTER COLUMN "costMicrocents" SET DEFAULT 0;

-- Backfill the legacy usage rows into the ledger as already-settled records. They keep the
-- epoch sentinel period on purpose: every credit query matches periodStart and periodEnd by
-- exact equality, so these rows are retained as billing history but can never be charged
-- against a real monthly allowance. Metered cost is converted with the started-turn rule,
-- except that a zero-cost legacy row stays at zero rather than inventing a charge.
UPDATE "AgentUsageEvent" e
SET "state" = 'settled',
    "settledAt" = e."createdAt",
    "providerStartedAt" = e."createdAt",
    "chargedCredits" = CASE WHEN e."costMicrocents" > 0 THEN GREATEST(1, CEIL(e."costMicrocents"::numeric / 1000000)::integer) ELSE 0 END,
    "reservedCredits" = CASE WHEN e."costMicrocents" > 0 THEN GREATEST(1, CEIL(e."costMicrocents"::numeric / 1000000)::integer) ELSE 0 END,
    "planSnapshot" = COALESCE(s."plan", 'pro'),
    "subscriptionStatusSnapshot" = COALESCE(s."status", 'trial')
FROM "AgentUsageEvent" x
LEFT JOIN "Subscription" s ON s."companyId" = x."companyId"
WHERE e."id" = x."id";

ALTER TABLE "AgentUsageEvent" ALTER COLUMN "allowanceCreditsSnapshot" DROP DEFAULT,
ALTER COLUMN "periodEnd" DROP DEFAULT,
ALTER COLUMN "periodStart" DROP DEFAULT,
ALTER COLUMN "planSnapshot" DROP DEFAULT,
ALTER COLUMN "subscriptionStatusSnapshot" DROP DEFAULT;

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
CREATE TABLE "AgentWorkspaceSetup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "reviewMessageId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "planHash" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "priorTerminology" JSONB NOT NULL,
    "status" "AgentWorkspaceSetupStatus" NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL,
    "cleanedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentWorkspaceSetup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentWorkspaceSetupResource" (
    "id" TEXT NOT NULL,
    "setupId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "AgentSetupResourceKind" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "initialUpdatedAt" TIMESTAMP(3) NOT NULL,
    "status" "AgentSetupResourceStatus" NOT NULL,
    "cleanupReason" "AgentSetupCleanupReason",
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentWorkspaceSetupResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentTurnRequest_companyId_userId_runId_status_idx" ON "AgentTurnRequest"("companyId", "userId", "runId", "status");

-- CreateIndex
CREATE INDEX "AgentTurnRequest_conversationId_companyId_userId_status_idx" ON "AgentTurnRequest"("conversationId", "companyId", "userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTurnRequest_companyId_userId_clientRequestId_key" ON "AgentTurnRequest"("companyId", "userId", "clientRequestId");

-- CreateIndex
CREATE INDEX "AgentWorkspaceSetup_companyId_userId_conversationId_idx" ON "AgentWorkspaceSetup"("companyId", "userId", "conversationId");

-- CreateIndex
CREATE INDEX "AgentWorkspaceSetup_companyId_userId_status_idx" ON "AgentWorkspaceSetup"("companyId", "userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentWorkspaceSetup_conversationId_reviewMessageId_commandI_key" ON "AgentWorkspaceSetup"("conversationId", "reviewMessageId", "commandId");

-- CreateIndex
CREATE INDEX "AgentWorkspaceSetupResource_companyId_setupId_createdAt_id_idx" ON "AgentWorkspaceSetupResource"("companyId", "setupId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AgentWorkspaceSetupResource_setupId_companyId_status_idx" ON "AgentWorkspaceSetupResource"("setupId", "companyId", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_agentConversationId_idx" ON "SupportTicket"("agentConversationId");

-- CreateIndex
CREATE INDEX "AgentConversation_companyId_userId_archivedAt_updatedAt_idx" ON "AgentConversation"("companyId", "userId", "archivedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "AgentConversation_companyId_userId_archivedAt_selectedAt_idx" ON "AgentConversation"("companyId", "userId", "archivedAt", "selectedAt");

-- CreateIndex
CREATE INDEX "AgentMessage_conversationId_role_sequence_idx" ON "AgentMessage"("conversationId", "role", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "AgentMessage_conversationId_sequence_key" ON "AgentMessage"("conversationId", "sequence");

-- CreateIndex
CREATE INDEX "AgentUsageEvent_userId_periodStart_periodEnd_state_idx" ON "AgentUsageEvent"("userId", "periodStart", "periodEnd", "state");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_agentConversationId_fkey" FOREIGN KEY ("agentConversationId") REFERENCES "AgentConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_turnRequestId_fkey" FOREIGN KEY ("turnRequestId") REFERENCES "AgentTurnRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTurnRequest" ADD CONSTRAINT "AgentTurnRequest_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWorkspaceSetup" ADD CONSTRAINT "AgentWorkspaceSetup_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWorkspaceSetupResource" ADD CONSTRAINT "AgentWorkspaceSetupResource_setupId_fkey" FOREIGN KEY ("setupId") REFERENCES "AgentWorkspaceSetup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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

ALTER TABLE "AgentWorkspaceSetup"
  ADD CONSTRAINT "AgentWorkspaceSetup_versions_positive" CHECK ("schemaVersion" >= 1 AND "revision" >= 1);
