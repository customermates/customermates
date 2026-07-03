-- DropForeignKey
ALTER TABLE "Apikey" DROP CONSTRAINT "Apikey_userId_fkey";

-- RenameColumn (preserves existing rows)
ALTER TABLE "Apikey" RENAME COLUMN "userId" TO "referenceId";

-- RenameIndex
ALTER INDEX "Apikey_userId_idx" RENAME TO "Apikey_referenceId_idx";

-- AddColumn
ALTER TABLE "Apikey" ADD COLUMN "configId" TEXT NOT NULL DEFAULT 'default';
