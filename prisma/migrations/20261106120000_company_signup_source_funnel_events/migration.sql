-- CreateEnum
CREATE TYPE "OnboardingJob" AS ENUM ('workspace', 'followup', 'agent');

-- CreateEnum
CREATE TYPE "CompanyFunnelEventType" AS ENUM ('jobSelected', 'setupCompleted', 'channelConnected', 'agentConnected');

-- CreateTable
CREATE TABLE "CompanySignupSource" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "job" "OnboardingJob",
    "landingPath" VARCHAR(512) NOT NULL,
    "referrerHost" VARCHAR(253),
    "utmSource" VARCHAR(128),
    "utmMedium" VARCHAR(128),
    "utmCampaign" VARCHAR(128),
    "marketingConsentedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanySignupSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyFunnelEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "CompanyFunnelEventType" NOT NULL,
    "job" "OnboardingJob",
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyFunnelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanySignupSource_companyId_key" ON "CompanySignupSource"("companyId");

-- CreateIndex
CREATE INDEX "CompanyFunnelEvent_occurredAt_idx" ON "CompanyFunnelEvent"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyFunnelEvent_companyId_type_key" ON "CompanyFunnelEvent"("companyId", "type");

-- AddForeignKey
ALTER TABLE "CompanySignupSource" ADD CONSTRAINT "CompanySignupSource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyFunnelEvent" ADD CONSTRAINT "CompanyFunnelEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

