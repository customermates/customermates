-- AlterTable
ALTER TABLE "User" ADD COLUMN     "legalAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "legalDpaVersion" TEXT,
ADD COLUMN     "legalPrivacyVersion" TEXT,
ADD COLUMN     "legalTermsVersion" TEXT;
