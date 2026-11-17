-- CreateEnum
CREATE TYPE "AutomationTriggerKind" AS ENUM ('recordCreated', 'recordUpdated', 'fieldChanged', 'dateReached', 'messageReceived', 'formSubmitted', 'webhookReceived');

-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('queued', 'running', 'applied', 'skipped', 'failed');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('dueToday', 'ruleAlert', 'replyReceived');

-- CreateEnum
CREATE TYPE "NotificationEmailMode" AS ENUM ('instant', 'digest', 'off');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('reserved', 'confirmed', 'cancelled');

-- AlterEnum
ALTER TYPE "CompanyFunnelEventType" ADD VALUE 'channelSkipped';
ALTER TYPE "CompanyFunnelEventType" ADD VALUE 'inviteSent';
ALTER TYPE "CompanyFunnelEventType" ADD VALUE 'inviteAccepted';
ALTER TYPE "CompanyFunnelEventType" ADD VALUE 'paid';

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
    "emailedInstantly" BOOLEAN NOT NULL DEFAULT false,
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

-- CreateTable
CREATE TABLE "CalendarEventRecordLink" (
    "companyId" TEXT NOT NULL,
    "calendarEventId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEventRecordLink_pkey" PRIMARY KEY ("companyId","calendarEventId","typeId","recordId")
);

-- CreateTable
CREATE TABLE "BookingLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calendarId" TEXT,
    "token" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
    "minNoticeMinutes" INTEGER NOT NULL DEFAULT 240,
    "horizonDays" INTEGER NOT NULL DEFAULT 30,
    "timeZone" TEXT NOT NULL,
    "workingHours" JSONB NOT NULL,
    "withVideo" BOOLEAN NOT NULL DEFAULT false,
    "personTypeId" TEXT,
    "personRelationshipId" TEXT,
    "recordTypeId" TEXT,
    "startFieldId" TEXT,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "successMessage" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bookingLinkId" TEXT NOT NULL,
    "calendarEventId" TEXT,
    "slotKey" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'reserved',
    "inviteeName" TEXT NOT NULL,
    "inviteeEmail" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timeZone" TEXT NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "personTypeId" TEXT,
    "personRecordId" TEXT,
    "recordTypeId" TEXT,
    "recordId" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicForm" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "consentVersion" INTEGER NOT NULL DEFAULT 1,
    "submissionCount" INTEGER NOT NULL DEFAULT 0,
    "lastSubmittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicFormSubmission" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "recordId" TEXT,
    "personRecordId" TEXT,
    "ipHash" TEXT,
    "locale" TEXT,
    "consentText" TEXT,
    "consentVersion" INTEGER,
    "consentedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicFormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingWebhook" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "tokenVersion" INTEGER NOT NULL DEFAULT 1,
    "signingSecret" TEXT,
    "signatureHeader" TEXT NOT NULL DEFAULT 'x-signature',
    "mapping" JSONB NOT NULL,
    "samplePayload" JSONB,
    "lastReceivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomingWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingWebhookDelivery" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "message" TEXT,
    "recordId" TEXT,
    "payloadBytes" INTEGER NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomingWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "AuthUser" ADD COLUMN "signupLastPage" VARCHAR(512),
ADD COLUMN "signupCampaign" VARCHAR(1024);

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "signupTemplate" VARCHAR(64),
ADD COLUMN "agentFirstCallAt" TIMESTAMP(3),
ADD COLUMN "agentLastCallAt" TIMESTAMP(3),
ADD COLUMN "signupLastPage" VARCHAR(512),
ADD COLUMN "signupCampaign" JSONB,
ADD COLUMN "teamSize" VARCHAR(16),
ADD COLUMN "discoveryChoice" VARCHAR(32),
ADD COLUMN "discoveryDetail" VARCHAR(200),
ADD COLUMN "discoveryUserId" TEXT,
ADD COLUMN "discoveryAnsweredAt" TIMESTAMP(3);

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
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_companyId_id_key" ON "CalendarEvent"("companyId", "id");

-- CreateIndex
CREATE INDEX "CalendarEventRecordLink_companyId_typeId_recordId_idx" ON "CalendarEventRecordLink"("companyId", "typeId", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingLink_token_key" ON "BookingLink"("token");

-- CreateIndex
CREATE INDEX "BookingLink_companyId_userId_idx" ON "BookingLink"("companyId", "userId");

-- CreateIndex
CREATE INDEX "BookingLink_calendarId_idx" ON "BookingLink"("calendarId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingLink_companyId_id_key" ON "BookingLink"("companyId", "id");

-- CreateIndex
CREATE INDEX "Booking_companyId_bookingLinkId_startsAt_idx" ON "Booking"("companyId", "bookingLinkId", "startsAt");

-- CreateIndex
CREATE INDEX "Booking_companyId_inviteeEmail_idx" ON "Booking"("companyId", "inviteeEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookingLinkId_slotKey_key" ON "Booking"("bookingLinkId", "slotKey");

-- CreateIndex
CREATE INDEX "PublicForm_createdById_idx" ON "PublicForm"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "PublicForm_companyId_typeId_key" ON "PublicForm"("companyId", "typeId");

-- CreateIndex
CREATE INDEX "PublicFormSubmission_formId_createdAt_idx" ON "PublicFormSubmission"("formId", "createdAt");

-- CreateIndex
CREATE INDEX "PublicFormSubmission_companyId_createdAt_idx" ON "PublicFormSubmission"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "PublicFormSubmission_formId_ipHash_createdAt_idx" ON "PublicFormSubmission"("formId", "ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "IncomingWebhook_companyId_typeId_idx" ON "IncomingWebhook"("companyId", "typeId");

-- CreateIndex
CREATE INDEX "IncomingWebhook_createdById_idx" ON "IncomingWebhook"("createdById");

-- CreateIndex
CREATE INDEX "IncomingWebhookDelivery_webhookId_createdAt_idx" ON "IncomingWebhookDelivery"("webhookId", "createdAt");

-- CreateIndex
CREATE INDEX "IncomingWebhookDelivery_companyId_createdAt_idx" ON "IncomingWebhookDelivery"("companyId", "createdAt");

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

-- AddForeignKey
ALTER TABLE "CalendarEventRecordLink" ADD CONSTRAINT "CalendarEventRecordLink_companyId_calendarEventId_fkey" FOREIGN KEY ("companyId", "calendarEventId") REFERENCES "CalendarEvent"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventRecordLink" ADD CONSTRAINT "CalendarEventRecordLink_companyId_typeId_recordId_fkey" FOREIGN KEY ("companyId", "typeId", "recordId") REFERENCES "CrmRecord"("companyId", "typeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventRecordLink" ADD CONSTRAINT "CalendarEventRecordLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingLink" ADD CONSTRAINT "BookingLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingLink" ADD CONSTRAINT "BookingLink_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "User"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingLink" ADD CONSTRAINT "BookingLink_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_companyId_bookingLinkId_fkey" FOREIGN KEY ("companyId", "bookingLinkId") REFERENCES "BookingLink"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicForm" ADD CONSTRAINT "PublicForm_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicForm" ADD CONSTRAINT "PublicForm_companyId_typeId_fkey" FOREIGN KEY ("companyId", "typeId") REFERENCES "RecordTypeDefinition"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicForm" ADD CONSTRAINT "PublicForm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicFormSubmission" ADD CONSTRAINT "PublicFormSubmission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicFormSubmission" ADD CONSTRAINT "PublicFormSubmission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "PublicForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingWebhook" ADD CONSTRAINT "IncomingWebhook_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingWebhook" ADD CONSTRAINT "IncomingWebhook_companyId_typeId_fkey" FOREIGN KEY ("companyId", "typeId") REFERENCES "RecordTypeDefinition"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingWebhook" ADD CONSTRAINT "IncomingWebhook_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingWebhookDelivery" ADD CONSTRAINT "IncomingWebhookDelivery_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingWebhookDelivery" ADD CONSTRAINT "IncomingWebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "IncomingWebhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "AgentProvider" AS ENUM ('anthropic', 'openai', 'google');

-- CreateEnum
CREATE TYPE "AgentRuntime" AS ENUM ('mate', 'ownKey', 'runner');

-- CreateEnum
CREATE TYPE "AgentJobStatus" AS ENUM ('queued', 'claimed', 'running', 'succeeded', 'failed', 'timedOut', 'cancelled');

-- CreateTable
CREATE TABLE "AgentProviderKey" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "AgentProvider" NOT NULL,
    "label" TEXT NOT NULL,
    "keyCiphertext" TEXT NOT NULL,
    "keyLast4" TEXT NOT NULL,
    "defaultModel" TEXT,
    "createdById" TEXT NOT NULL,
    "validatedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentProviderKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRunner" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "machine" TEXT,
    "clients" JSONB NOT NULL DEFAULT '[]',
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRunner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "runtime" "AgentRuntime" NOT NULL,
    "status" "AgentJobStatus" NOT NULL DEFAULT 'queued',
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT,
    "idempotencyKey" TEXT,
    "ruleChain" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ownerUserId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "promptUntrusted" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT,
    "pinnedRunnerId" TEXT,
    "runnerId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "timeoutAt" TIMESTAMP(3),
    "result" JSONB,
    "transcript" JSONB,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costMicrocents" BIGINT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentProviderKey_companyId_createdById_idx" ON "AgentProviderKey"("companyId", "createdById");

-- CreateIndex
CREATE UNIQUE INDEX "AgentProviderKey_companyId_provider_key" ON "AgentProviderKey"("companyId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRunner_tokenHash_key" ON "AgentRunner"("tokenHash");

-- CreateIndex
CREATE INDEX "AgentRunner_companyId_revokedAt_idx" ON "AgentRunner"("companyId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRunner_companyId_id_key" ON "AgentRunner"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AgentJob_companyId_idempotencyKey_key" ON "AgentJob"("companyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentJob_companyId_status_createdAt_idx" ON "AgentJob"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AgentJob_companyId_runnerId_status_idx" ON "AgentJob"("companyId", "runnerId", "status");

-- CreateIndex
CREATE INDEX "AgentJob_status_timeoutAt_idx" ON "AgentJob"("status", "timeoutAt");

-- CreateIndex
CREATE INDEX "AgentJob_status_queuedAt_idx" ON "AgentJob"("status", "queuedAt");

-- AddForeignKey
ALTER TABLE "AgentProviderKey" ADD CONSTRAINT "AgentProviderKey_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProviderKey" ADD CONSTRAINT "AgentProviderKey_companyId_createdById_fkey" FOREIGN KEY ("companyId", "createdById") REFERENCES "User"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRunner" ADD CONSTRAINT "AgentRunner_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRunner" ADD CONSTRAINT "AgentRunner_companyId_createdById_fkey" FOREIGN KEY ("companyId", "createdById") REFERENCES "User"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentJob" ADD CONSTRAINT "AgentJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentJob" ADD CONSTRAINT "AgentJob_companyId_ownerUserId_fkey" FOREIGN KEY ("companyId", "ownerUserId") REFERENCES "User"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentJob" ADD CONSTRAINT "AgentJob_runnerId_fkey" FOREIGN KEY ("runnerId") REFERENCES "AgentRunner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "NotificationPause" (
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,
    "timeZone" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPause_pkey" PRIMARY KEY ("companyId","userId")
);

-- CreateIndex
CREATE INDEX "NotificationPause_userId_idx" ON "NotificationPause"("userId");

-- AddForeignKey
ALTER TABLE "NotificationPause" ADD CONSTRAINT "NotificationPause_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPause" ADD CONSTRAINT "NotificationPause_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "AgentUsagePurpose" ADD VALUE 'automationCompose';
