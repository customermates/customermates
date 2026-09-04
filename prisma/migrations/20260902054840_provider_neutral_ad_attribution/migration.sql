/*
  Warnings:

  - You are about to drop the column `googleAdsAttributionConsentedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `googleAdsClickId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `googleAdsClickIdCapturedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `googleAdsClickIdExpiresAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `googleAdsClickIdKind` on the `User` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ConversionEventType" AS ENUM ('signup', 'paid');

-- DropIndex
DROP INDEX "User_googleAdsClickIdExpiresAt_id_idx";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "googleAdsAttributionConsentedAt",
DROP COLUMN "googleAdsClickId",
DROP COLUMN "googleAdsClickIdCapturedAt",
DROP COLUMN "googleAdsClickIdExpiresAt",
DROP COLUMN "googleAdsClickIdKind";

-- CreateTable
CREATE TABLE "AdAttribution" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "identifierKind" VARCHAR(32) NOT NULL,
    "identifierValue" VARCHAR(512) NOT NULL,
    "clickedAt" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "consentNoticeVersion" VARCHAR(32) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "ConversionEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdAttribution_companyId_idx" ON "AdAttribution"("companyId");

-- CreateIndex
CREATE INDEX "AdAttribution_userId_idx" ON "AdAttribution"("userId");

-- CreateIndex
CREATE INDEX "AdAttribution_expiresAt_id_idx" ON "AdAttribution"("expiresAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AdAttribution_companyId_provider_key" ON "AdAttribution"("companyId", "provider");

-- CreateIndex
CREATE INDEX "ConversionEvent_companyId_idx" ON "ConversionEvent"("companyId");

-- CreateIndex
CREATE INDEX "ConversionEvent_occurredAt_idx" ON "ConversionEvent"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConversionEvent_companyId_type_key" ON "ConversionEvent"("companyId", "type");

-- AddForeignKey
ALTER TABLE "AdAttribution" ADD CONSTRAINT "AdAttribution_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAttribution" ADD CONSTRAINT "AdAttribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversionEvent" ADD CONSTRAINT "ConversionEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
