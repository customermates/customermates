-- CreateEnum
CREATE TYPE "AutomationTriggerKind" AS ENUM ('recordCreated', 'recordUpdated', 'fieldChanged', 'dateReached', 'messageReceived', 'formSubmitted', 'webhookReceived');

-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('queued', 'running', 'applied', 'skipped', 'failed');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('assigned', 'dueToday', 'formSubmission', 'ruleAlert', 'replyReceived');

-- CreateEnum
CREATE TYPE "NotificationEmailMode" AS ENUM ('instant', 'digest', 'off');

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "triggerKind" "AutomationTriggerKind" NOT NULL,
    "typeId" TEXT,
    "trigger" JSONB NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "effects" JSONB NOT NULL,
    "disabledReason" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" "AutomationRunStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRuleRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "occurrenceKey" TEXT NOT NULL,
    "status" "AutomationRunStatus" NOT NULL DEFAULT 'queued',
    "triggerKind" "AutomationTriggerKind" NOT NULL,
    "typeId" TEXT,
    "recordId" TEXT,
    "payload" JSONB,
    "outcome" JSONB,
    "error" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRuleRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "sourceRuleId" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "emailMode" "NotificationEmailMode" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("companyId","userId","kind")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRule_companyId_id_key" ON "AutomationRule"("companyId", "id");

-- CreateIndex
CREATE INDEX "AutomationRule_companyId_enabled_triggerKind_typeId_idx" ON "AutomationRule"("companyId", "enabled", "triggerKind", "typeId");

-- CreateIndex
CREATE INDEX "AutomationRule_enabled_triggerKind_idx" ON "AutomationRule"("enabled", "triggerKind");

-- CreateIndex
CREATE INDEX "AutomationRule_ownerUserId_idx" ON "AutomationRule"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRuleRun_ruleId_occurrenceKey_key" ON "AutomationRuleRun"("ruleId", "occurrenceKey");

-- CreateIndex
CREATE INDEX "AutomationRuleRun_companyId_ruleId_createdAt_idx" ON "AutomationRuleRun"("companyId", "ruleId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationRuleRun_status_scheduledFor_idx" ON "AutomationRuleRun"("status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_companyId_userId_dedupeKey_key" ON "Notification"("companyId", "userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_companyId_userId_readAt_createdAt_idx" ON "Notification"("companyId", "userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_companyId_userId_createdAt_idx" ON "Notification"("companyId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_emailedAt_createdAt_idx" ON "Notification"("emailedAt", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationPreference_companyId_userId_idx" ON "NotificationPreference"("companyId", "userId");

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRuleRun" ADD CONSTRAINT "AutomationRuleRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRuleRun" ADD CONSTRAINT "AutomationRuleRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
