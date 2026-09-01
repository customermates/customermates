-- AlterTable
ALTER TABLE "Routine" ADD COLUMN     "changedFields" TEXT[],
ADD COLUMN     "triggerFilters" JSONB;
