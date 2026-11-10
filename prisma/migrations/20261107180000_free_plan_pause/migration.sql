-- AlterTable
ALTER TABLE "User" ADD COLUMN "pausedByPlanAt" TIMESTAMP(3),
ADD COLUMN "planPauseNoticeSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Routine" ADD COLUMN "pausedByPlanAt" TIMESTAMP(3);

-- Free keeps one active person: the creator, else the billing contact, else the earliest admin, else the earliest member.
-- Members paused here count as notified, so nobody receives the pause email at deploy; only later pauses send it.
WITH "free" AS (
  SELECT s."companyId", s."checkoutEmail"
  FROM "Subscription" AS s
  WHERE s."plan" <> 'enterprise'
    AND s."trialEndDate" IS NOT NULL
    AND (s."status" = 'expired' OR (s."status" = 'trial' AND s."trialEndDate" < NOW()))
),
"ranked" AS (
  SELECT u."id",
    ROW_NUMBER() OVER (
      PARTITION BY u."companyId"
      ORDER BY
        CASE
          WHEN au."email" IS NOT NULL AND lower(u."email") = lower(au."email") THEN 0
          WHEN f."checkoutEmail" IS NOT NULL AND lower(u."email") = lower(f."checkoutEmail") THEN 1
          WHEN r."isSystemRole" THEN 2
          ELSE 3
        END,
        u."createdAt",
        u."id"
    ) AS "position"
  FROM "User" AS u
  JOIN "free" AS f ON f."companyId" = u."companyId"
  JOIN "Company" AS c ON c."id" = u."companyId"
  LEFT JOIN "AuthUser" AS au ON au."id" = c."createdByAuthUserId"
  LEFT JOIN "UserRole" AS r ON r."id" = u."roleId"
  WHERE u."status" = 'active' AND u."leftAt" IS NULL
)
UPDATE "User" AS u
SET "status" = 'inactive',
  "pausedByPlanAt" = NOW(),
  "planPauseNoticeSentAt" = NOW(),
  "agentCreditActivatedAt" = NULL,
  "updatedAt" = NOW()
FROM "ranked"
WHERE "ranked"."id" = u."id" AND "ranked"."position" > 1;

-- Pending join requests end while the workspace is on Free
UPDATE "User" AS u
SET "status" = 'inactive', "leftAt" = NOW(), "updatedAt" = NOW()
FROM "Subscription" AS s
WHERE s."companyId" = u."companyId"
  AND u."status" = 'pendingAuthorization'
  AND u."leftAt" IS NULL
  AND s."plan" <> 'enterprise'
  AND s."trialEndDate" IS NOT NULL
  AND (s."status" = 'expired' OR (s."status" = 'trial' AND s."trialEndDate" < NOW()));

DELETE FROM "InviteToken" AS t
USING "Subscription" AS s
WHERE s."companyId" = t."companyId"
  AND s."plan" <> 'enterprise'
  AND s."trialEndDate" IS NOT NULL
  AND (s."status" = 'expired' OR (s."status" = 'trial' AND s."trialEndDate" < NOW()));

-- Routines pause on Free and resume on any paid plan
WITH "paused" AS (
  UPDATE "Routine" AS r
  SET "enabled" = false,
    "nextRunAt" = NULL,
    "disabledReason" = 'planPaused',
    "pausedByPlanAt" = NOW(),
    "updatedAt" = NOW()
  FROM "Subscription" AS s
  WHERE s."companyId" = r."companyId"
    AND r."enabled"
    AND r."deletedAt" IS NULL
    AND s."plan" <> 'enterprise'
    AND s."trialEndDate" IS NOT NULL
    AND (s."status" = 'expired' OR (s."status" = 'trial' AND s."trialEndDate" < NOW()))
  RETURNING r."companyId", r."id"
)
UPDATE "RecordEventSubscription" AS e
SET "enabled" = false, "revision" = e."revision" + 1
FROM "paused"
WHERE e."companyId" = "paused"."companyId" AND e."id" = "paused"."id" AND e."kind" = 'routine';
