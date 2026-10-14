-- AI workspace setup: one setup row per workspace, and per-workspace accounting of platform-paid spend so the setup can run under a hard cap per workspace.

-- CreateEnum
CREATE TYPE "WorkspaceSetupStatus" AS ENUM ('interview', 'planning', 'planned', 'building', 'completed', 'failed', 'rolledBack');

-- AlterTable
ALTER TABLE "WikiWebsiteCrawl" ADD COLUMN     "payer" TEXT NOT NULL DEFAULT 'requester';

-- CreateTable
CREATE TABLE "HostedAiPlatformWorkspaceUsage" (
    "companyId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicrocents" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HostedAiPlatformWorkspaceUsage_pkey" PRIMARY KEY ("companyId","purpose")
);

-- CreateTable
CREATE TABLE "HostedAiPlatformWorkspaceHold" (
    "reservationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "reservedMicrocents" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HostedAiPlatformWorkspaceHold_pkey" PRIMARY KEY ("reservationId")
);

-- CreateTable
CREATE TABLE "WorkspaceSetup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "WorkspaceSetupStatus" NOT NULL DEFAULT 'interview',
    "websiteUrl" TEXT,
    "crawlId" TEXT,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "interview" JSONB NOT NULL DEFAULT '{}',
    "plan" JSONB,
    "planRevision" INTEGER NOT NULL DEFAULT 0,
    "phases" JSONB NOT NULL DEFAULT '{}',
    "artifacts" JSONB NOT NULL DEFAULT '{}',
    "created" JSONB NOT NULL DEFAULT '{}',
    "results" JSONB NOT NULL DEFAULT '{}',
    "spreadsheetName" TEXT,
    "spreadsheetBytes" BYTEA,
    "workflowRunId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSetup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HostedAiPlatformWorkspaceHold_companyId_purpose_idx" ON "HostedAiPlatformWorkspaceHold"("companyId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceSetup_companyId_key" ON "WorkspaceSetup"("companyId");

-- AddForeignKey
ALTER TABLE "HostedAiPlatformWorkspaceUsage" ADD CONSTRAINT "HostedAiPlatformWorkspaceUsage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostedAiPlatformWorkspaceHold" ADD CONSTRAINT "HostedAiPlatformWorkspaceHold_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSetup" ADD CONSTRAINT "WorkspaceSetup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Uploaded spreadsheets stay inside the reader bound (5 MB), and ledger amounts never go negative.
ALTER TABLE "WorkspaceSetup" ADD CONSTRAINT "WorkspaceSetup_spreadsheetBytes_size" CHECK ("spreadsheetBytes" IS NULL OR octet_length("spreadsheetBytes") <= 5242880);
ALTER TABLE "HostedAiPlatformWorkspaceUsage" ADD CONSTRAINT "HostedAiPlatformWorkspaceUsage_amounts_nonnegative" CHECK ("costMicrocents" >= 0 AND "inputTokens" >= 0);
ALTER TABLE "HostedAiPlatformWorkspaceHold" ADD CONSTRAINT "HostedAiPlatformWorkspaceHold_reserved_positive" CHECK ("reservedMicrocents" > 0);
