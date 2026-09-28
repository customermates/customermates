-- AlterEnum
ALTER TYPE "Resource" ADD VALUE 'wiki';

-- AlterTable
ALTER TABLE "AgentTurnRequest" ADD COLUMN     "wikiHomepageSetupUrl" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardingWikiStepCompletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WikiPage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WikiPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WikiPage_companyId_createdAt_id_idx" ON "WikiPage"("companyId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "WikiPage" ADD CONSTRAINT "WikiPage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing users who already completed onboarding did so before the Wiki step existed.
UPDATE "User"
SET "onboardingWikiStepCompletedAt" = "createdAt"
WHERE "onboardingWikiStepCompletedAt" IS NULL
  AND "onboardingWizardCompletedAt" IS NOT NULL;
