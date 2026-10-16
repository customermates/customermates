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

-- At most one open interval per subject.
CREATE UNIQUE INDEX "BillingUsageInterval_open_subject_key" ON "BillingUsageInterval"("kind", "subjectId") WHERE "endedAt" IS NULL;

-- Transaction time in UTC at the columns' millisecond precision, so that a stop and
-- a restart in one transaction compare equal.
CREATE FUNCTION "billing_usage_now"() RETURNS TIMESTAMP(3) LANGUAGE sql STABLE AS $$
    SELECT (now() AT TIME ZONE 'UTC')::TIMESTAMP(3)
$$;

-- Opens an interval when a subject starts counting, closes it when it stops, and
-- keeps the snapshot of an open interval current. A stop and a restart inside the
-- same transaction leave the interval untouched instead of recording a zero gap.
CREATE FUNCTION "billing_usage_open"(
    p_company TEXT, p_kind "BillingUsageKind", p_subject TEXT,
    p_first TEXT, p_last TEXT, p_email TEXT, p_role TEXT, p_provider TEXT, p_identifier TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    UPDATE "BillingUsageInterval"
    SET "firstName" = p_first, "lastName" = p_last, "email" = p_email, "roleName" = p_role,
        "provider" = p_provider, "identifier" = p_identifier
    WHERE "kind" = p_kind AND "subjectId" = p_subject AND "endedAt" IS NULL AND "companyId" = p_company
      AND ("firstName", "lastName", "email", "roleName", "provider", "identifier")
          IS DISTINCT FROM (p_first, p_last, p_email, p_role, p_provider, p_identifier);
    IF EXISTS (
        SELECT 1 FROM "BillingUsageInterval"
        WHERE "kind" = p_kind AND "subjectId" = p_subject AND "endedAt" IS NULL AND "companyId" = p_company
    ) THEN
        RETURN;
    END IF;

    UPDATE "BillingUsageInterval"
    SET "endedAt" = NULL, "firstName" = p_first, "lastName" = p_last, "email" = p_email, "roleName" = p_role,
        "provider" = p_provider, "identifier" = p_identifier
    WHERE "kind" = p_kind AND "subjectId" = p_subject AND "companyId" = p_company AND "endedAt" = "billing_usage_now"();
    IF FOUND THEN
        RETURN;
    END IF;

    INSERT INTO "BillingUsageInterval" (
        "id", "companyId", "kind", "subjectId", "startedAt",
        "firstName", "lastName", "email", "roleName", "provider", "identifier"
    ) VALUES (
        gen_random_uuid()::text, p_company, p_kind, p_subject, "billing_usage_now"(),
        p_first, p_last, p_email, p_role, p_provider, p_identifier
    );
END;
$$;

CREATE FUNCTION "billing_usage_close"(p_company TEXT, p_kind "BillingUsageKind", p_subject TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM "BillingUsageInterval"
    WHERE "kind" = p_kind AND "subjectId" = p_subject AND "companyId" = p_company
      AND "endedAt" IS NULL AND "startedAt" = "billing_usage_now"();
    UPDATE "BillingUsageInterval"
    SET "endedAt" = "billing_usage_now"()
    WHERE "kind" = p_kind AND "subjectId" = p_subject AND "companyId" = p_company AND "endedAt" IS NULL;
END;
$$;

CREATE FUNCTION "billing_usage_record_seat"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    was_seat BOOLEAN := TG_OP <> 'INSERT' AND OLD."status" = 'active';
    is_seat BOOLEAN := TG_OP <> 'DELETE' AND NEW."status" = 'active';
    role_name TEXT;
BEGIN
    IF was_seat AND (NOT is_seat OR OLD."companyId" <> NEW."companyId") THEN
        PERFORM "billing_usage_close"(OLD."companyId", 'seat', OLD."id");
    END IF;
    IF is_seat THEN
        SELECT "name" INTO role_name FROM "UserRole" WHERE "id" = NEW."roleId";
        PERFORM "billing_usage_open"(
            NEW."companyId", 'seat', NEW."id",
            NEW."firstName", NEW."lastName", NEW."email", role_name, NULL, NULL
        );
    END IF;
    RETURN NULL;
END;
$$;

CREATE FUNCTION "billing_usage_record_channel"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    was_channel BOOLEAN := TG_OP <> 'INSERT' AND OLD."status" <> 'deleted';
    is_channel BOOLEAN := TG_OP <> 'DELETE' AND NEW."status" <> 'deleted';
BEGIN
    IF was_channel AND (NOT is_channel OR OLD."companyId" <> NEW."companyId") THEN
        PERFORM "billing_usage_close"(OLD."companyId", 'channel', OLD."id");
    END IF;
    IF is_channel THEN
        PERFORM "billing_usage_open"(
            NEW."companyId", 'channel', NEW."id", NULL, NULL, NULL, NULL,
            NEW."provider"::text, COALESCE(NULLIF(NEW."emailAddress", ''), NULLIF(NEW."displayName", ''), NEW."unipileAccountId")
        );
    END IF;
    RETURN NULL;
END;
$$;

CREATE FUNCTION "billing_usage_record_workspace"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO "BillingUsageWorkspace" ("companyId", "createdAt")
        VALUES (NEW."id", NEW."createdAt")
        ON CONFLICT ("companyId") DO UPDATE SET "deletedAt" = NULL;
    ELSE
        UPDATE "BillingUsageWorkspace" SET "deletedAt" = "billing_usage_now"() WHERE "companyId" = OLD."id";
    END IF;
    RETURN NULL;
END;
$$;

-- Backfill the workspaces that exist now. Their earlier seat changes are unknown;
-- connected-account history is known from the event log since the messaging
-- migration that cleared all earlier accounts.
INSERT INTO "BillingUsageWorkspace" ("companyId", "createdAt", "seatsRecordedFrom", "channelsRecordedFrom")
SELECT c."id", c."createdAt", "billing_usage_now"(),
       CASE WHEN m."finished_at" IS NOT NULL AND c."createdAt" < m."finished_at" THEN m."finished_at" END
FROM "Company" c
LEFT JOIN LATERAL (
    SELECT MIN("finished_at") AS "finished_at"
    FROM "_prisma_migrations"
    WHERE "migration_name" = '20260625161605_unipile_v2_messaging'
) m ON TRUE;

-- Users active now count from their latest activation; that start is inferred.
INSERT INTO "BillingUsageInterval" (
    "id", "companyId", "kind", "subjectId", "startedAt", "startExact",
    "firstName", "lastName", "email", "roleName"
)
SELECT gen_random_uuid()::text, u."companyId", 'seat', u."id",
       LEAST(COALESCE(u."agentCreditActivatedAt", u."createdAt"), "billing_usage_now"()), FALSE,
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

CREATE TRIGGER "billing_usage_seat"
AFTER INSERT OR UPDATE OF "status", "companyId", "roleId", "firstName", "lastName", "email" OR DELETE ON "User"
FOR EACH ROW EXECUTE FUNCTION "billing_usage_record_seat"();

CREATE TRIGGER "billing_usage_channel"
AFTER INSERT OR UPDATE OF "status", "companyId", "provider", "emailAddress", "displayName" OR DELETE ON "ConnectedAccount"
FOR EACH ROW EXECUTE FUNCTION "billing_usage_record_channel"();

CREATE TRIGGER "billing_usage_workspace"
AFTER INSERT OR DELETE ON "Company"
FOR EACH ROW EXECUTE FUNCTION "billing_usage_record_workspace"();
