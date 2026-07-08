-- AlterTable
ALTER TABLE "ConnectedAccount" ADD COLUMN "linkedinProducts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
