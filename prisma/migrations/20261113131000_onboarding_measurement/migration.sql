-- AlterTable
ALTER TABLE "AuthUser" ADD COLUMN "signupLastPage" VARCHAR(512);

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "signupLastPage" VARCHAR(512),
ADD COLUMN "discoveryChoice" VARCHAR(32),
ADD COLUMN "discoveryDetail" VARCHAR(200),
ADD COLUMN "discoveryUserId" TEXT,
ADD COLUMN "discoveryAnsweredAt" TIMESTAMP(3);
