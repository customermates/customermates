-- CreateTable
CREATE TABLE "ApiRateLimitWindow" (
    "companyId" TEXT NOT NULL,
    "window" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ApiRateLimitWindow_pkey" PRIMARY KEY ("companyId","window","windowStart")
);

-- AddForeignKey
ALTER TABLE "ApiRateLimitWindow" ADD CONSTRAINT "ApiRateLimitWindow_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reactivate members the retired trial-end job set Inactive: their workspace now continues on the Free plan
UPDATE "User" AS u
SET "status" = 'active', "updatedAt" = NOW()
FROM "Subscription" AS s
WHERE s."companyId" = u."companyId"
  AND u."status" = 'inactive'
  AND u."leftAt" IS NULL
  AND u."trialInactivationNoticeSentAt" IS NOT NULL
  AND s."plan" <> 'enterprise'
  AND s."trialEndDate" IS NOT NULL
  AND s."status" IN ('trial', 'expired');
