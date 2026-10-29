-- CreateEnum
CREATE TYPE "AdConversionUploadMode" AS ENUM ('validate', 'ingest');

-- CreateEnum
CREATE TYPE "AdConversionUploadStatus" AS ENUM ('sending', 'accepted', 'rejected', 'ambiguous');

-- CreateTable
CREATE TABLE "AdConversionUpload" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "destination" VARCHAR(64) NOT NULL,
    "conversionType" "ConversionEventType" NOT NULL,
    "orderId" VARCHAR(64) NOT NULL,
    "mode" "AdConversionUploadMode" NOT NULL,
    "status" "AdConversionUploadStatus" NOT NULL,
    "httpStatus" INTEGER,
    "errorStatus" VARCHAR(64),
    "requestId" VARCHAR(128),
    "attemptedAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "AdConversionUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdConversionUpload_companyId_idx" ON "AdConversionUpload"("companyId");

-- CreateIndex
CREATE INDEX "AdConversionUpload_batchId_idx" ON "AdConversionUpload"("batchId");

-- CreateIndex
CREATE INDEX "AdConversionUpload_provider_mode_status_idx" ON "AdConversionUpload"("provider", "mode", "status");

-- AddForeignKey
ALTER TABLE "AdConversionUpload" ADD CONSTRAINT "AdConversionUpload_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
