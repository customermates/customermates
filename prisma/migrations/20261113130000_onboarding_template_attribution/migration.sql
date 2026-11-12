-- AlterTable
ALTER TABLE "Company" ADD COLUMN "signupTemplate" VARCHAR(64),
ADD COLUMN "agentFirstCallAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WorkspaceSetup" ADD COLUMN "templateSlug" VARCHAR(64);
