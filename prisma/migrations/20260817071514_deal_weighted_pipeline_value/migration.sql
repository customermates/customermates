-- AlterEnum
ALTER TYPE "AggregationType" ADD VALUE 'dealWeightedValue';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "dealWeightingColumnId" TEXT;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "weightedValue" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "Deal_weightedValue_idx" ON "Deal"("weightedValue");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_dealWeightingColumnId_fkey" FOREIGN KEY ("dealWeightingColumnId") REFERENCES "CustomColumn"("id") ON DELETE SET NULL ON UPDATE CASCADE;
