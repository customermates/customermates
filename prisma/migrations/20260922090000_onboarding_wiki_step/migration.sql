-- AlterTable
ALTER TABLE "User" ADD COLUMN "onboardingWikiStepCompletedAt" TIMESTAMP(3);

-- Existing users who already completed onboarding did so before this step existed.
UPDATE "User"
SET "onboardingWikiStepCompletedAt" = "createdAt"
WHERE "onboardingWikiStepCompletedAt" IS NULL
  AND "onboardingWizardCompletedAt" IS NOT NULL;
