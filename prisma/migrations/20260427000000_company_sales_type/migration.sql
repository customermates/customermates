-- CreateEnum
CREATE TYPE "SalesType" AS ENUM ('product', 'service');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "salesType" "SalesType";
