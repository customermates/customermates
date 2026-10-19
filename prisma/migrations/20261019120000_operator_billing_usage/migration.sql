-- CreateEnum
CREATE TYPE "BillingUsageKind" AS ENUM ('seat', 'channel');

-- CreateTable
CREATE TABLE "BillingUsageInterval" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "BillingUsageKind" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "startExact" BOOLEAN NOT NULL DEFAULT true,
    "endExact" BOOLEAN NOT NULL DEFAULT true,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "roleName" TEXT,
    "provider" TEXT,
    "identifier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingUsageInterval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingUsageWorkspace" (
    "companyId" TEXT NOT NULL,
    "workspaceCreatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "seatsRecordedFrom" TIMESTAMP(3),
    "channelsRecordedFrom" TIMESTAMP(3),
    "workspaceLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingUsageWorkspace_pkey" PRIMARY KEY ("companyId")
);

-- CreateIndex
CREATE INDEX "BillingUsageInterval_companyId_kind_startedAt_idx" ON "BillingUsageInterval"("companyId", "kind", "startedAt");

-- CreateIndex
CREATE INDEX "BillingUsageInterval_kind_startedAt_idx" ON "BillingUsageInterval"("kind", "startedAt");

-- CreateIndex
CREATE INDEX "BillingUsageInterval_kind_endedAt_idx" ON "BillingUsageInterval"("kind", "endedAt");

-- At most one open interval per subject. The application keeps the ledger
-- (features/billing-usage/prisma-billing-usage.repository.ts).
CREATE UNIQUE INDEX "BillingUsageInterval_open_subject_key" ON "BillingUsageInterval"("companyId", "kind", "subjectId") WHERE "endedAt" IS NULL;

-- Backfill the workspaces that exist now. Their earlier seat changes are unknown. The
-- activity log holds the connected-account history since the messaging migration cleared
-- all earlier accounts, so channel changes are known from its first connected-account entry.
INSERT INTO "BillingUsageWorkspace" ("companyId", "workspaceCreatedAt", "seatsRecordedFrom", "channelsRecordedFrom")
SELECT c."id", c."createdAt", CURRENT_TIMESTAMP, CASE WHEN c."createdAt" < h."startedAt" THEN h."startedAt" END
FROM "Company" c
CROSS JOIN (
    SELECT COALESCE(MIN("createdAt"), CURRENT_TIMESTAMP) AS "startedAt" FROM "EventLog" WHERE "subjectKind" = 'connected_account'
) h;

-- Users active now count from their latest activation; that start is inferred.
INSERT INTO "BillingUsageInterval" (
    "id", "companyId", "kind", "subjectId", "startedAt", "startExact",
    "firstName", "lastName", "email", "roleName"
)
SELECT gen_random_uuid()::text, u."companyId", 'seat', u."id",
       LEAST(COALESCE(u."agentCreditActivatedAt", u."createdAt"), CURRENT_TIMESTAMP), FALSE,
       u."firstName", u."lastName", u."email", r."name"
FROM "User" u
LEFT JOIN "UserRole" r ON r."id" = u."roleId"
WHERE u."status" = 'active' AND u."leftAt" IS NULL;

-- Legal notices go only to active users, so each one proves a seat at that moment.
-- Notices before a user's current seat become one closed seat from the first to
-- the last of them; both times are inferred.
WITH notices AS (
    SELECT e."companyId", e."subjectId" AS "userId",
           MIN(e."createdAt") AS "firstNoticeAt", MAX(e."createdAt") AS "lastNoticeAt"
    FROM "EventLog" e
    LEFT JOIN "BillingUsageInterval" s
        ON s."kind" = 'seat' AND s."companyId" = e."companyId" AND s."subjectId" = e."subjectId"
    WHERE e."kind" = 'legal.notice_sent' AND e."subjectKind" = 'legal'
      AND (s."startedAt" IS NULL OR e."createdAt" < s."startedAt")
    GROUP BY e."companyId", e."subjectId"
)
INSERT INTO "BillingUsageInterval" (
    "id", "companyId", "kind", "subjectId", "startedAt", "endedAt", "startExact", "endExact",
    "firstName", "lastName", "email", "roleName"
)
SELECT gen_random_uuid()::text, n."companyId", 'seat', n."userId", n."firstNoticeAt", n."lastNoticeAt", FALSE, FALSE,
       u."firstName", u."lastName", u."email", r."name"
FROM notices n
JOIN "User" u ON u."id" = n."userId" AND u."companyId" = n."companyId"
LEFT JOIN "UserRole" r ON r."id" = u."roleId";

-- Connected accounts from the activity log. A removal without a deleted entry ends at the
-- account row's last update, or at the account's last entry once the row is gone, and is
-- marked inexact.
WITH accounts AS (
    SELECT "companyId", "subjectId" AS "accountId",
           MIN("createdAt") FILTER (WHERE "kind" = 'connected_account.created') AS "connectedAt",
           MAX("createdAt") FILTER (WHERE "kind" = 'connected_account.deleted') AS "deletedAt",
           MAX("createdAt") AS "lastEventAt",
           MIN(payload->>'provider') AS "provider",
           MIN(COALESCE(NULLIF(payload->>'emailAddress', ''), NULLIF(payload->>'displayName', ''))) AS "identifier"
    FROM "EventLog"
    WHERE "subjectKind" = 'connected_account'
    GROUP BY "companyId", "subjectId"
)
INSERT INTO "BillingUsageInterval" (
    "id", "companyId", "kind", "subjectId", "startedAt", "endedAt", "startExact", "endExact", "provider", "identifier"
)
SELECT gen_random_uuid()::text, a."companyId", 'channel', a."accountId", a."connectedAt",
       CASE WHEN r."status" <> 'deleted' THEN NULL ELSE COALESCE(a."deletedAt", r."updatedAt", a."lastEventAt") END,
       TRUE,
       COALESCE(r."status" <> 'deleted', FALSE) OR a."deletedAt" IS NOT NULL,
       COALESCE(r."provider"::text, a."provider"),
       COALESCE(NULLIF(r."emailAddress", ''), NULLIF(r."displayName", ''), a."identifier", r."unipileAccountId")
FROM accounts a
LEFT JOIN "ConnectedAccount" r ON r."id" = a."accountId" AND r."companyId" = a."companyId"
WHERE a."connectedAt" IS NOT NULL;

-- An account still connected without a logged connect counts from its row's creation,
-- marked inexact.
INSERT INTO "BillingUsageInterval" (
    "id", "companyId", "kind", "subjectId", "startedAt", "startExact", "provider", "identifier"
)
SELECT gen_random_uuid()::text, r."companyId", 'channel', r."id", r."createdAt", FALSE, r."provider"::text,
       COALESCE(NULLIF(r."emailAddress", ''), NULLIF(r."displayName", ''), r."unipileAccountId")
FROM "ConnectedAccount" r
WHERE r."status" <> 'deleted'
  AND NOT EXISTS (
      SELECT 1 FROM "BillingUsageInterval" i
      WHERE i."companyId" = r."companyId" AND i."kind" = 'channel' AND i."subjectId" = r."id" AND i."endedAt" IS NULL
  );

-- Platform operator access moves from workspace memberships to the login.
ALTER TABLE "AuthUser" ADD COLUMN "isPlatformOperator" BOOLEAN NOT NULL DEFAULT false;

-- A login keeps access exactly when it had it: an active membership with the flag.
UPDATE "AuthUser" AS login
SET "isPlatformOperator" = true
WHERE EXISTS (
  SELECT 1
  FROM "User" AS member
  WHERE lower(member."email") = lower(login."email")
    AND member."isPlatformOperator"
    AND member."status" = 'active'
    AND member."leftAt" IS NULL
);

ALTER TABLE "User" DROP COLUMN "isPlatformOperator";
