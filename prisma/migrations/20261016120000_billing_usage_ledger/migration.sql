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

    CONSTRAINT "BillingUsageInterval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingUsageWorkspace" (
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "seatsRecordedFrom" TIMESTAMP(3),
    "channelsRecordedFrom" TIMESTAMP(3),

    CONSTRAINT "BillingUsageWorkspace_pkey" PRIMARY KEY ("companyId")
);

-- CreateIndex
CREATE INDEX "BillingUsageInterval_companyId_kind_startedAt_idx" ON "BillingUsageInterval"("companyId", "kind", "startedAt");

-- CreateIndex
CREATE INDEX "BillingUsageInterval_kind_startedAt_idx" ON "BillingUsageInterval"("kind", "startedAt");

-- CreateIndex
CREATE INDEX "BillingUsageInterval_kind_endedAt_idx" ON "BillingUsageInterval"("kind", "endedAt");

-- At most one open interval per subject. The application keeps the ledger
-- (features/billing-usage/billing-usage-ledger.ts).
CREATE UNIQUE INDEX "BillingUsageInterval_open_subject_key" ON "BillingUsageInterval"("kind", "subjectId") WHERE "endedAt" IS NULL;

-- Backfill the workspaces that exist now. Their earlier seat changes are unknown;
-- connected-account history is known from the event log since the messaging
-- migration that cleared all earlier accounts (claimed only when its time is known).
DO $$
DECLARE
    messaging_history_from TIMESTAMP(3);
BEGIN
    IF to_regclass('"_prisma_migrations"') IS NOT NULL THEN
        EXECUTE 'SELECT MIN("finished_at") AT TIME ZONE ''UTC'' FROM "_prisma_migrations" WHERE "migration_name" = $1'
            INTO messaging_history_from
            USING '20260625161605_unipile_v2_messaging';
    END IF;
    messaging_history_from := COALESCE(messaging_history_from, (now() AT TIME ZONE 'UTC')::TIMESTAMP(3));

    INSERT INTO "BillingUsageWorkspace" ("companyId", "createdAt", "seatsRecordedFrom", "channelsRecordedFrom")
    SELECT c."id", c."createdAt", (now() AT TIME ZONE 'UTC')::TIMESTAMP(3),
           CASE WHEN c."createdAt" < messaging_history_from THEN messaging_history_from END
    FROM "Company" c;
END;
$$;

-- Users active now count from their latest activation; that start is inferred.
INSERT INTO "BillingUsageInterval" (
    "id", "companyId", "kind", "subjectId", "startedAt", "startExact",
    "firstName", "lastName", "email", "roleName"
)
SELECT gen_random_uuid()::text, u."companyId", 'seat', u."id",
       LEAST(COALESCE(u."agentCreditActivatedAt", u."createdAt"), (now() AT TIME ZONE 'UTC')::TIMESTAMP(3)), FALSE,
       u."firstName", u."lastName", u."email", r."name"
FROM "User" u
LEFT JOIN "UserRole" r ON r."id" = u."roleId"
WHERE u."status" = 'active';

-- Connected accounts from the event log and the account rows. A disconnect without
-- an event falls back to the row's last update or the account's last event and is
-- marked inexact.
WITH ev AS (
    SELECT "companyId", "subjectId" AS "accountId", "kind", "createdAt",
           payload->>'provider' AS "provider",
           COALESCE(NULLIF(payload->>'emailAddress', ''), NULLIF(payload->>'displayName', '')) AS "identifier"
    FROM "EventLog"
    WHERE "subjectKind" = 'connected_account'
),
by_account AS (
    SELECT "companyId", "accountId",
           MIN("createdAt") FILTER (WHERE "kind" = 'connected_account.created') AS "createdEventAt",
           MAX("createdAt") FILTER (WHERE "kind" = 'connected_account.deleted') AS "deletedEventAt",
           MIN("createdAt") AS "firstEventAt",
           MAX("createdAt") AS "lastEventAt",
           MIN("provider") AS "provider",
           MIN("identifier") AS "identifier"
    FROM ev
    GROUP BY "companyId", "accountId"
),
accounts AS (
    SELECT COALESCE(a."companyId", b."companyId") AS "companyId",
           COALESCE(a."id", b."accountId") AS "accountId",
           a."id" IS NOT NULL AS "rowExists",
           a."status"::text AS "status",
           a."createdAt" AS "rowCreatedAt",
           a."updatedAt" AS "rowUpdatedAt",
           b."createdEventAt", b."deletedEventAt", b."firstEventAt", b."lastEventAt",
           COALESCE(a."provider"::text, b."provider") AS "provider",
           COALESCE(NULLIF(a."emailAddress", ''), NULLIF(a."displayName", ''), b."identifier", a."unipileAccountId") AS "identifier"
    FROM "ConnectedAccount" a
    FULL OUTER JOIN by_account b ON b."accountId" = a."id" AND b."companyId" = a."companyId"
)
INSERT INTO "BillingUsageInterval" (
    "id", "companyId", "kind", "subjectId", "startedAt", "endedAt", "startExact", "endExact", "provider", "identifier"
)
SELECT gen_random_uuid()::text, "companyId", 'channel', "accountId",
       COALESCE("createdEventAt", "rowCreatedAt", "firstEventAt"),
       CASE
           WHEN "rowExists" AND "status" <> 'deleted' THEN NULL
           WHEN "deletedEventAt" IS NOT NULL THEN "deletedEventAt"
           WHEN "rowExists" AND "status" = 'deleted' THEN "rowUpdatedAt"
           WHEN NOT "rowExists" THEN "lastEventAt"
       END,
       "createdEventAt" IS NOT NULL OR "rowExists",
       ("rowExists" AND "status" <> 'deleted') OR "deletedEventAt" IS NOT NULL,
       "provider", "identifier"
FROM accounts
WHERE "companyId" IS NOT NULL AND COALESCE("createdEventAt", "rowCreatedAt", "firstEventAt") IS NOT NULL;
