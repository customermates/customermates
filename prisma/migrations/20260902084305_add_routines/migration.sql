-- CreateEnum
CREATE TYPE "AgentConversationOrigin" AS ENUM ('user', 'routine');

-- CreateEnum
CREATE TYPE "RoutineTriggerKind" AS ENUM ('schedule', 'event');

-- CreateEnum
CREATE TYPE "RoutineRunStatus" AS ENUM ('queued', 'running', 'succeeded', 'partial', 'failed', 'skipped', 'blocked');

-- CreateEnum
CREATE TYPE "RoutineRiskKind" AS ENUM ('selfLoop', 'mutualLoop');

-- CreateEnum
CREATE TYPE "RoutineRiskSeverity" AS ENUM ('info', 'warning');

-- AlterTable
ALTER TABLE "AgentConversation" ADD COLUMN     "creditCeiling" INTEGER,
ADD COLUMN     "origin" "AgentConversationOrigin" NOT NULL DEFAULT 'user';

-- CreateTable
CREATE TABLE "Routine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "modelKey" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "triggerKind" "RoutineTriggerKind" NOT NULL,
    "cronExpression" TEXT,
    "timezone" TEXT,
    "runOnceAt" TIMESTAMP(3),
    "triggerEvents" TEXT[],
    "changedFields" TEXT[],
    "triggerFilters" JSONB,
    "debounceSeconds" INTEGER NOT NULL DEFAULT 300,
    "maxRunsPerHour" INTEGER NOT NULL DEFAULT 4,
    "maxCreditsPerRun" INTEGER NOT NULL DEFAULT 10,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" "RoutineRunStatus",
    "disabledReason" TEXT,
    "suppressedEventCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Routine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "conversationId" TEXT,
    "turnRequestId" TEXT,
    "status" "RoutineRunStatus" NOT NULL DEFAULT 'queued',
    "triggerKind" "RoutineTriggerKind" NOT NULL,
    "triggerEvent" TEXT,
    "triggerEntityId" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "terminalCode" "AgentTurnTerminalCode",
    "chargedCredits" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutineRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineRiskFinding" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "peerRoutineId" TEXT,
    "kind" "RoutineRiskKind" NOT NULL,
    "severity" "RoutineRiskSeverity" NOT NULL DEFAULT 'warning',
    "triggerEvent" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutineRiskFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Routine_companyId_idx" ON "Routine"("companyId");

-- CreateIndex
CREATE INDEX "Routine_companyId_enabled_idx" ON "Routine"("companyId", "enabled");

-- CreateIndex
CREATE INDEX "Routine_enabled_nextRunAt_idx" ON "Routine"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "Routine_ownerUserId_idx" ON "Routine"("ownerUserId");

-- CreateIndex
CREATE INDEX "RoutineRun_companyId_idx" ON "RoutineRun"("companyId");

-- CreateIndex
CREATE INDEX "RoutineRun_companyId_routineId_createdAt_idx" ON "RoutineRun"("companyId", "routineId", "createdAt");

-- CreateIndex
CREATE INDEX "RoutineRun_status_scheduledFor_idx" ON "RoutineRun"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "RoutineRun_routineId_status_idx" ON "RoutineRun"("routineId", "status");

-- CreateIndex
CREATE INDEX "RoutineRun_conversationId_idx" ON "RoutineRun"("conversationId");

-- CreateIndex
CREATE INDEX "RoutineRiskFinding_companyId_idx" ON "RoutineRiskFinding"("companyId");

-- CreateIndex
CREATE INDEX "RoutineRiskFinding_companyId_resolvedAt_idx" ON "RoutineRiskFinding"("companyId", "resolvedAt");

-- CreateIndex
CREATE INDEX "RoutineRiskFinding_routineId_resolvedAt_idx" ON "RoutineRiskFinding"("routineId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineRiskFinding_routineId_kind_triggerEvent_peerRoutineI_key" ON "RoutineRiskFinding"("routineId", "kind", "triggerEvent", "peerRoutineId");

-- CreateIndex
CREATE INDEX "AgentConversation_companyId_userId_origin_archivedAt_update_idx" ON "AgentConversation"("companyId", "userId", "origin", "archivedAt", "updatedAt");

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineRun" ADD CONSTRAINT "RoutineRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineRun" ADD CONSTRAINT "RoutineRun_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineRun" ADD CONSTRAINT "RoutineRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineRiskFinding" ADD CONSTRAINT "RoutineRiskFinding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineRiskFinding" ADD CONSTRAINT "RoutineRiskFinding_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
