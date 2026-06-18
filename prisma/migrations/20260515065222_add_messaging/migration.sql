-- Drop dead column + index from the polling-era webhook delivery queue (no worker-side advisory lock needed).
DROP INDEX IF EXISTS "WebhookDelivery_status_lockedAt_idx";
ALTER TABLE "WebhookDelivery" DROP COLUMN IF EXISTS "lockedAt";

-- CreateEnum
CREATE TYPE "MessagingThreadState" AS ENUM ('unread', 'open', 'closed', 'spam');

-- CreateEnum
CREATE TYPE "MessagingThreadType" AS ENUM ('single', 'group', 'channel');

-- CreateEnum
CREATE TYPE "MessagingProvider" AS ENUM ('google', 'outlook', 'mail', 'linkedin', 'whatsapp', 'instagram', 'telegram');

-- CreateEnum
CREATE TYPE "ConnectedAccountStatus" AS ENUM ('ok', 'connecting', 'credentials', 'permissions', 'error', 'stopped', 'deleted');

-- CreateEnum
CREATE TYPE "MessagingMessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "MessagingMessageOrigin" AS ENUM ('unipile', 'external');

-- CreateEnum
CREATE TYPE "AccountActivityKind" AS ENUM ('linkedin_connection_accepted');

-- CreateEnum
CREATE TYPE "CalendarEventStatus" AS ENUM ('confirmed', 'cancelled');

-- CreateEnum
CREATE TYPE "UnipileWebhookSource" AS ENUM ('account_status', 'account_callback', 'messaging', 'mail', 'calendar', 'users');


-- AlterEnum
ALTER TYPE "Resource" ADD VALUE 'inboxMessages';

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "avatarUrl" TEXT;

-- CreateTable
CREATE TABLE "ConnectedAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unipileAccountId" TEXT NOT NULL,
    "provider" "MessagingProvider" NOT NULL,
    "status" "ConnectedAccountStatus" NOT NULL DEFAULT 'connecting',
    "hasMessaging" BOOLEAN NOT NULL DEFAULT false,
    "hasCalendar" BOOLEAN NOT NULL DEFAULT false,
    "emailAddress" TEXT,
    "displayName" TEXT,
    "ownUnipileAttendeeId" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "syncing" BOOLEAN NOT NULL DEFAULT false,
    "ownerAvatarUrl" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "backfillCheckpoint" JSONB,
    "backfillEpoch" INTEGER NOT NULL DEFAULT 0,
    "backfillClaimedAt" TIMESTAMP(3),
    "backfillClaimToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingThread" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "connectedAccountId" TEXT NOT NULL,
    "state" "MessagingThreadState" NOT NULL DEFAULT 'unread',
    "type" "MessagingThreadType" NOT NULL DEFAULT 'single',
    "name" TEXT,
    "unipileThreadId" TEXT NOT NULL,
    "provider" "MessagingProvider" NOT NULL,
    "subject" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "sharedToCrm" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingThreadParticipant" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "messagingThreadId" TEXT NOT NULL,
    "provider" "MessagingProvider" NOT NULL,
    "unipileAttendeeId" TEXT NOT NULL,
    "identifier" TEXT,
    "displayName" TEXT,
    "pictureUrl" TEXT,
    "profileUrl" TEXT,
    "headline" TEXT,
    "occupation" TEXT,
    "isSelf" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingThreadParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "messagingThreadId" TEXT NOT NULL,
    "connectedAccountId" TEXT NOT NULL,
    "unipileMessageId" TEXT NOT NULL,
    "provider" "MessagingProvider" NOT NULL,
    "direction" "MessagingMessageDirection" NOT NULL,
    "origin" "MessagingMessageOrigin" NOT NULL,
    "sender" JSONB NOT NULL,
    "senderIdentifier" TEXT,
    "recipients" JSONB NOT NULL DEFAULT '{}',
    "reactions" JSONB NOT NULL DEFAULT '[]',
    "subject" TEXT,
    "bodyText" TEXT,
    "bodyHtml" TEXT,
    "attachmentsMeta" JSONB NOT NULL DEFAULT '[]',
    "isEvent" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountActivity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "connectedAccountId" TEXT,
    "identifier" TEXT,
    "kind" "AccountActivityKind" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactIdentifier" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "provider" "MessagingProvider" NOT NULL,
    "value" TEXT NOT NULL,
    "messagingId" TEXT,
    "displayName" TEXT,
    "pictureUrl" TEXT,
    "profileUrl" TEXT,
    "headline" TEXT,
    "occupation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Calendar" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "connectedAccountId" TEXT NOT NULL,
    "unipileCalendarId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "timezone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "connectedAccountId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "unipileEventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "conferenceUrl" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT,
    "recurrenceRule" TEXT,
    "status" "CalendarEventStatus" NOT NULL DEFAULT 'confirmed',
    "visibility" TEXT,
    "attendees" JSONB NOT NULL DEFAULT '[]',
    "organizer" JSONB,
    "attendeeEmails" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingInboundEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "connectedAccountId" TEXT,
    "source" TEXT NOT NULL,
    "eventType" TEXT,
    "accountId" TEXT,
    "unipileMessageId" TEXT,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "MessagingInboundEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedAccount_unipileAccountId_key" ON "ConnectedAccount"("unipileAccountId");

-- CreateIndex
CREATE INDEX "ConnectedAccount_companyId_idx" ON "ConnectedAccount"("companyId");

-- CreateIndex
CREATE INDEX "ConnectedAccount_userId_idx" ON "ConnectedAccount"("userId");

-- CreateIndex
CREATE INDEX "ConnectedAccount_companyId_provider_idx" ON "ConnectedAccount"("companyId", "provider");

-- CreateIndex
CREATE INDEX "MessagingThread_companyId_idx" ON "MessagingThread"("companyId");

-- CreateIndex
CREATE INDEX "MessagingThread_companyId_state_idx" ON "MessagingThread"("companyId", "state");

-- CreateIndex
CREATE INDEX "MessagingThread_companyId_lastMessageAt_idx" ON "MessagingThread"("companyId", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "MessagingThread_companyId_sharedToCrm_idx" ON "MessagingThread"("companyId", "sharedToCrm");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingThread_connectedAccountId_unipileThreadId_key" ON "MessagingThread"("connectedAccountId", "unipileThreadId");

-- CreateIndex
CREATE INDEX "MessagingThreadParticipant_companyId_idx" ON "MessagingThreadParticipant"("companyId");

-- CreateIndex
CREATE INDEX "MessagingThreadParticipant_messagingThreadId_idx" ON "MessagingThreadParticipant"("messagingThreadId");

-- CreateIndex
CREATE INDEX "MessagingThreadParticipant_companyId_provider_identifier_idx" ON "MessagingThreadParticipant"("companyId", "provider", "identifier");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingThreadParticipant_messagingThreadId_unipileAttende_key" ON "MessagingThreadParticipant"("messagingThreadId", "unipileAttendeeId");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingThreadParticipant_messagingThreadId_identifier_key" ON "MessagingThreadParticipant"("messagingThreadId", "identifier");

-- CreateIndex
CREATE INDEX "MessagingMessage_companyId_idx" ON "MessagingMessage"("companyId");

-- CreateIndex
CREATE INDEX "MessagingMessage_messagingThreadId_sentAt_idx" ON "MessagingMessage"("messagingThreadId", "sentAt");

-- CreateIndex
CREATE INDEX "MessagingMessage_companyId_provider_senderIdentifier_idx" ON "MessagingMessage"("companyId", "provider", "senderIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingMessage_connectedAccountId_unipileMessageId_key" ON "MessagingMessage"("connectedAccountId", "unipileMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountActivity_connectedAccountId_kind_identifier_key" ON "AccountActivity"("connectedAccountId", "kind", "identifier");

-- CreateIndex
CREATE INDEX "AccountActivity_companyId_occurredAt_idx" ON "AccountActivity"("companyId", "occurredAt");

-- CreateIndex
CREATE INDEX "AccountActivity_companyId_identifier_idx" ON "AccountActivity"("companyId", "identifier");

-- CreateIndex
CREATE INDEX "ContactIdentifier_contactId_idx" ON "ContactIdentifier"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactIdentifier_companyId_provider_value_key" ON "ContactIdentifier"("companyId", "provider", "value");

-- CreateIndex
CREATE UNIQUE INDEX "ContactIdentifier_companyId_provider_messagingId_key" ON "ContactIdentifier"("companyId", "provider", "messagingId");

-- CreateIndex
CREATE INDEX "Calendar_companyId_idx" ON "Calendar"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Calendar_connectedAccountId_unipileCalendarId_key" ON "Calendar"("connectedAccountId", "unipileCalendarId");

-- CreateIndex
CREATE INDEX "CalendarEvent_companyId_startsAt_idx" ON "CalendarEvent"("companyId", "startsAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_attendeeEmails_idx" ON "CalendarEvent" USING GIN ("attendeeEmails");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_connectedAccountId_unipileEventId_key" ON "CalendarEvent"("connectedAccountId", "unipileEventId");

-- AddForeignKey
ALTER TABLE "ConnectedAccount" ADD CONSTRAINT "ConnectedAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectedAccount" ADD CONSTRAINT "ConnectedAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingThread" ADD CONSTRAINT "MessagingThread_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingThread" ADD CONSTRAINT "MessagingThread_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingThreadParticipant" ADD CONSTRAINT "MessagingThreadParticipant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingThreadParticipant" ADD CONSTRAINT "MessagingThreadParticipant_messagingThreadId_fkey" FOREIGN KEY ("messagingThreadId") REFERENCES "MessagingThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingMessage" ADD CONSTRAINT "MessagingMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingMessage" ADD CONSTRAINT "MessagingMessage_messagingThreadId_fkey" FOREIGN KEY ("messagingThreadId") REFERENCES "MessagingThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingMessage" ADD CONSTRAINT "MessagingMessage_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountActivity" ADD CONSTRAINT "AccountActivity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountActivity" ADD CONSTRAINT "AccountActivity_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactIdentifier" ADD CONSTRAINT "ContactIdentifier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactIdentifier" ADD CONSTRAINT "ContactIdentifier_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Calendar" ADD CONSTRAINT "Calendar_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Calendar" ADD CONSTRAINT "Calendar_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingInboundEvent" ADD CONSTRAINT "MessagingInboundEvent_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Widget" DROP COLUMN "data";

-- Backfill: migrate existing Contact.emails into ContactIdentifier (provider 'mail') before dropping the column.
INSERT INTO "ContactIdentifier" ("id", "companyId", "contactId", "provider", "value", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    c."companyId",
    c."id",
    'mail'::"MessagingProvider",
    lower(btrim(email)),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Contact" c
CROSS JOIN LATERAL unnest(c."emails") AS email
WHERE btrim(email) <> ''
ORDER BY c."createdAt" ASC, c."id" ASC
ON CONFLICT DO NOTHING;

-- DropIndex
DROP INDEX "Contact_emailsText_idx";

-- DropIndex
DROP INDEX "Contact_emails_idx";

-- AlterTable
ALTER TABLE "Contact" DROP COLUMN "emailsText",
DROP COLUMN "emails";

