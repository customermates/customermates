-- CreateTable
CREATE TABLE "EntityTerminology" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "presetKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityTerminology_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntityTerminology_companyId_idx" ON "EntityTerminology"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityTerminology_companyId_entityType_key" ON "EntityTerminology"("companyId", "entityType");

-- AddForeignKey
ALTER TABLE "EntityTerminology" ADD CONSTRAINT "EntityTerminology_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable (retire the onboarding-only sales type; existing rows keep their data, only this column is removed)
ALTER TABLE "Company" DROP COLUMN "salesType";

-- DropEnum
DROP TYPE "SalesType";
