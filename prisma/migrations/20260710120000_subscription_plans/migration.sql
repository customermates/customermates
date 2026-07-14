-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('starter', 'pro', 'business', 'enterprise');

-- AlterTable (backfill existing subscriptions to starter, then default new ones to pro)
ALTER TABLE "Subscription" ADD COLUMN "plan" "SubscriptionPlan" NOT NULL DEFAULT 'starter';
ALTER TABLE "Subscription" ALTER COLUMN "plan" SET DEFAULT 'pro';

-- AlterTable
ALTER TABLE "Company" DROP COLUMN "city",
DROP COLUMN "country",
DROP COLUMN "email",
DROP COLUMN "name",
DROP COLUMN "phone",
DROP COLUMN "postalCode",
DROP COLUMN "street",
DROP COLUMN "vatNumber",
DROP COLUMN "website";
