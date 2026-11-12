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
