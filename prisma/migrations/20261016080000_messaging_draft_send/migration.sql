-- CreateEnum
CREATE TYPE "MessagingDraftSendState" AS ENUM ('sending', 'sent', 'unknown');

-- CreateTable
CREATE TABLE "MessagingDraftSend" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "connectedAccountId" TEXT NOT NULL,
    "draftMessageId" TEXT NOT NULL,
    "draftRevision" TIMESTAMP(3) NOT NULL,
    "state" "MessagingDraftSendState" NOT NULL DEFAULT 'sending',
    "unipileMessageId" TEXT,
    "providerMessageId" TEXT,
    "sentMessageId" TEXT,
    "sentThreadId" TEXT,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingDraftSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessagingDraftSend_connectedAccountId_idx" ON "MessagingDraftSend"("connectedAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingDraftSend_companyId_draftMessageId_key" ON "MessagingDraftSend"("companyId", "draftMessageId");

-- AddForeignKey
ALTER TABLE "MessagingDraftSend" ADD CONSTRAINT "MessagingDraftSend_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingDraftSend" ADD CONSTRAINT "MessagingDraftSend_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

