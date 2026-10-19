-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "deletingAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "checkoutEmail" TEXT;
