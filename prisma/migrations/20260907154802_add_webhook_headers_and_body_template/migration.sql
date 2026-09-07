-- AlterTable
ALTER TABLE "Webhook" ADD COLUMN     "bodyTemplate" TEXT,
ADD COLUMN     "headers" JSONB;
