-- AlterEnum
ALTER TYPE "CompanyFunnelEventType" ADD VALUE 'channelSkipped';
ALTER TYPE "CompanyFunnelEventType" ADD VALUE 'inviteSent';
ALTER TYPE "CompanyFunnelEventType" ADD VALUE 'inviteAccepted';
ALTER TYPE "CompanyFunnelEventType" ADD VALUE 'paid';

-- AlterTable
ALTER TABLE "AuthUser" ADD COLUMN "signupCampaign" VARCHAR(1024);

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "signupCampaign" JSONB,
ADD COLUMN "teamSize" VARCHAR(16),
ADD COLUMN "agentLastCallAt" TIMESTAMP(3);
