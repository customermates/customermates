-- CreateEnum
CREATE TYPE "WikiPageProposalAction" AS ENUM ('create', 'update', 'delete');

-- CreateEnum
CREATE TYPE "WikiPageProposalStatus" AS ENUM ('pending', 'approved', 'rejected', 'superseded');

-- CreateTable
CREATE TABLE "WikiPageProposal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "pageId" TEXT,
    "action" "WikiPageProposalAction" NOT NULL,
    "status" "WikiPageProposalStatus" NOT NULL DEFAULT 'pending',
    "title" TEXT,
    "markdown" TEXT,
    "kind" "WikiPageKind",
    "whenToUse" TEXT,
    "baseUpdatedAt" TIMESTAMP(3),
    "routineId" TEXT,
    "routineRunId" TEXT,
    "conversationId" TEXT,
    "proposedByUserId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WikiPageProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WikiPageProposal_companyId_status_createdAt_idx" ON "WikiPageProposal"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "WikiPageProposal_companyId_pageId_status_idx" ON "WikiPageProposal"("companyId", "pageId", "status");

-- CreateIndex
CREATE INDEX "WikiPageProposal_routineRunId_idx" ON "WikiPageProposal"("routineRunId");

-- AddForeignKey
ALTER TABLE "WikiPageProposal" ADD CONSTRAINT "WikiPageProposal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPageProposal" ADD CONSTRAINT "WikiPageProposal_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPageProposal" ADD CONSTRAINT "WikiPageProposal_routineRunId_fkey" FOREIGN KEY ("routineRunId") REFERENCES "RoutineRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

