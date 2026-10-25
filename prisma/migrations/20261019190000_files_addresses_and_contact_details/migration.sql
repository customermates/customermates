-- =============================================================================================
-- Record files, addresses, calendars and contact details.
--
--   1. Record files: uploaded files with their storage parts and extracted text for search, also the files given to
--      Mate in a chat, the enterprise storage allowance and the file indexing usage purpose.
--   2. Addresses and postal codes: address values, and postal codes shared by every workspace.
--   3. Calendars: calendar views, calendar and map widgets, private calendar subscriptions.
--   4. Contact details: phone and email fields become identities of the list's contact details field (one identity
--      per number or address and workspace, shared by every record that has it and reused when the inbox already
--      knows it); the field is renamed from its former default name; the database refuses phone and email fields
--      from then on.
--
-- prisma migrate deploy runs the file as one implicit transaction. See README.md next to this file for the lock timeout
-- and a read-only inventory to run before deploying.
-- =============================================================================================

SET LOCAL TIME ZONE 'UTC';
SET LOCAL lock_timeout = '60s';
SET LOCAL jit = off;

-- The record engine's per-workspace lock of every workspace, in id order, before any table lock: a configuration or
-- record write of the previous release that holds its workspace's lock then finishes instead of waiting for a table
-- this file has already locked, and no such write runs while phone and email fields move.
SELECT pg_advisory_xact_lock(hashtextextended(workspace.id, 0))
FROM (SELECT id FROM "Company" ORDER BY id) workspace;

-- ---------------------------------------------------------------------------------------------
-- 1. Record files
-- ---------------------------------------------------------------------------------------------

-- File fields keep their bytes outside RecordValue: RecordFile holds each upload's metadata and lifecycle,
-- RecordFileContent the parts the database storage driver writes, RecordFileChunk the extracted text for search.
CREATE TYPE "RecordFileStatus" AS ENUM ('pending', 'ready', 'detached');

CREATE TYPE "RecordFileExtractionStatus" AS ENUM ('pending', 'done', 'noText', 'unsupported', 'failed', 'skipped');

-- A file is in a field with both its list and field, or in neither: a file given to Mate in a chat stays pending
-- without a field until Mate or the user files it onto a record, and conversationId keeps it for its chat. Only a file
-- in a field can be ready. Indexing workers claim a file for five minutes and count their attempts, so a file that
-- keeps failing is marked failed instead of being retried forever. Truncation at the extraction cap is recorded for
-- readers, embeddedModel tells search and the indexer which files still need vectors, and the page count of a PDF
-- lets Mate pass short PDFs to the model as files.
CREATE TABLE "RecordFile" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "typeId" TEXT,
  "fieldId" TEXT,
  "recordId" TEXT,
  "conversationId" TEXT,
  "storageDriver" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" BIGINT NOT NULL,
  "sha256" TEXT,
  "status" "RecordFileStatus" NOT NULL DEFAULT 'pending',
  "uploadedById" TEXT,
  "extractionStatus" "RecordFileExtractionStatus" NOT NULL DEFAULT 'pending',
  "extractedText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attachedAt" TIMESTAMP(3),
  "detachedAt" TIMESTAMP(3),
  "indexedAt" TIMESTAMP(3),
  "textTruncated" BOOLEAN NOT NULL DEFAULT false,
  "indexClaimedAt" TIMESTAMP(3),
  "indexAttempts" INTEGER NOT NULL DEFAULT 0,
  "embeddedModel" TEXT,
  "pageCount" INTEGER,
  CONSTRAINT "RecordFile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecordFile_field_valid"
    CHECK (("typeId" IS NULL) = ("fieldId" IS NULL) AND ("fieldId" IS NOT NULL OR "status" <> 'ready')),
  CONSTRAINT "RecordFile_pageCount_valid" CHECK ("pageCount" IS NULL OR "pageCount" >= 0)
);

-- The daily file cleanup finds detached files whose 30 days have passed, chat cleanup and the send path find a chat's
-- unfiled files, and the recovery sweep finds attached files that still wait for extraction, each without scanning a
-- workspace's other files. A file whose bytes another file of the workspace already has reuses its extracted text.
CREATE UNIQUE INDEX "RecordFile_storageKey_key" ON "RecordFile"("storageKey");
CREATE INDEX "RecordFile_companyId_status_createdAt_idx" ON "RecordFile"("companyId", "status", "createdAt");
CREATE INDEX "RecordFile_companyId_status_detachedAt_idx" ON "RecordFile"("companyId", "status", "detachedAt");
CREATE INDEX "RecordFile_companyId_recordId_idx" ON "RecordFile"("companyId", "recordId");
CREATE INDEX "RecordFile_companyId_fieldId_idx" ON "RecordFile"("companyId", "fieldId");
CREATE INDEX "RecordFile_companyId_sha256_idx" ON "RecordFile"("companyId", "sha256");
CREATE INDEX "RecordFile_companyId_conversationId_idx" ON "RecordFile"("companyId", "conversationId");
CREATE INDEX "RecordFile_pending_extraction_idx" ON "RecordFile"("attachedAt")
  WHERE "status" = 'ready' AND "extractionStatus" = 'pending';

-- Records and fields are deliberately not foreign keys: their deletion must remove the stored bytes too, which the
-- file lifecycle does before it deletes the rows.
ALTER TABLE "RecordFile" ADD CONSTRAINT "RecordFile_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordFile" ADD CONSTRAINT "RecordFile_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RecordFileContent" (
  "fileKey" TEXT NOT NULL,
  "part" INTEGER NOT NULL,
  "companyId" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  CONSTRAINT "RecordFileContent_pkey" PRIMARY KEY ("fileKey", "part")
);

CREATE INDEX "RecordFileContent_companyId_idx" ON "RecordFileContent"("companyId");

ALTER TABLE "RecordFileContent" ADD CONSTRAINT "RecordFileContent_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- File contents are indexed like Knowledge Base pages. A chunk remembers where its passage starts in the extracted
-- text, so search can open a file at the match, and which embedding model produced its vector, so a model change
-- re-embeds it. Vectors are reused across a workspace's chunks with the same content hash.
CREATE TABLE "RecordFileChunk" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "offset" INTEGER NOT NULL,
  "heading" TEXT,
  "text" TEXT NOT NULL,
  "searchVector" tsvector GENERATED ALWAYS AS (wiki_search_vector(COALESCE("heading", ''), "text")) STORED,
  "contentHash" TEXT NOT NULL,
  "model" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecordFileChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecordFileChunk_fileId_ordinal_key" ON "RecordFileChunk"("fileId", "ordinal");
CREATE INDEX "RecordFileChunk_companyId_fileId_idx" ON "RecordFileChunk"("companyId", "fileId");
CREATE INDEX "RecordFileChunk_companyId_contentHash_idx" ON "RecordFileChunk"("companyId", "contentHash");
CREATE INDEX "RecordFileChunk_searchVector_idx" ON "RecordFileChunk" USING GIN ("searchVector");

ALTER TABLE "RecordFileChunk" ADD CONSTRAINT "RecordFileChunk_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordFileChunk" ADD CONSTRAINT "RecordFileChunk_fileId_fkey"
  FOREIGN KEY ("fileId") REFERENCES "RecordFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- pgvector is optional: self-hosted databases without the extension keep full-text and typo search of file contents.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
  ALTER TABLE "RecordFileChunk" ADD COLUMN "embedding" vector(768);
EXCEPTION
  WHEN undefined_file OR insufficient_privilege OR feature_not_supported THEN
    RAISE NOTICE 'pgvector is unavailable, so file content search stays keyword-only on this database.';
END
$$;

-- Enterprise contracts set the file storage each active user adds to the workspace pool; NULL uses the default.
ALTER TABLE "Subscription" ADD COLUMN "enterpriseFileStorageBytesPerUser" BIGINT;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_enterprise_file_storage_valid"
  CHECK ("enterpriseFileStorageBytesPerUser" IS NULL OR "enterpriseFileStorageBytesPerUser" BETWEEN 1 AND 1099511627776);

-- File indexing is a workspace-level charge on the pooled AI credits, like Knowledge Base indexing. Nothing in this
-- file uses the new label as an enum value, so adding it inside the migration transaction is safe.
ALTER TYPE "AgentUsagePurpose" ADD VALUE 'fileIndexing';

ALTER TABLE "AgentUsageEvent" DROP CONSTRAINT "AgentUsageEvent_user_or_workspace_charge";
ALTER TABLE "AgentUsageEvent" ADD CONSTRAINT "AgentUsageEvent_user_or_workspace_charge" CHECK (
  "userId" IS NOT NULL OR "purpose"::text IN ('wikiIndexing', 'fileIndexing')
);

-- ---------------------------------------------------------------------------------------------
-- 2. Addresses and postal codes
-- ---------------------------------------------------------------------------------------------

-- An address keeps its parts in jsonValue and its formatted line in textValue, where search, sorting and the
-- contains filter read it; every other value still fills exactly one column.
ALTER TABLE "RecordValue" DROP CONSTRAINT "RecordValue_shape_check";
ALTER TABLE "RecordValue" ADD CONSTRAINT "RecordValue_shape_check" CHECK (
  ("state" = 'value' AND "errorCode" IS NULL AND (
    num_nonnulls("textValue", "decimalValue", "booleanValue", "instantValue", "jsonValue") + CASE WHEN cardinality("textListValue") > 0 THEN 1 ELSE 0 END = 1
    OR (
      num_nonnulls("decimalValue", "booleanValue", "instantValue") = 0 AND cardinality("textListValue") = 0
      AND "textValue" IS NOT NULL AND jsonb_typeof("jsonValue") = 'object' AND ("jsonValue" ->> 'formatted') IS NOT NULL
    )
  ))
  OR ("state" = 'missing' AND cardinality("textListValue") = 0 AND num_nonnulls("textValue", "decimalValue", "booleanValue", "instantValue", "jsonValue", "errorCode") = 0)
  OR ("state" = 'error' AND cardinality("textListValue") = 0 AND "errorCode" IS NOT NULL AND num_nonnulls("textValue", "decimalValue", "booleanValue", "instantValue", "jsonValue") = 0)
);

-- Postal codes from GeoNames (CC BY 4.0), loaded per country on first use. They hold no workspace data.
CREATE TABLE "PostalCodeCountry" (
  "countryCode" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "loadedAt" TIMESTAMP(3),
  "attemptedAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "failure" TEXT,
  CONSTRAINT "PostalCodeCountry_pkey" PRIMARY KEY ("countryCode"),
  CONSTRAINT "PostalCodeCountry_status_check" CHECK ("status" IN ('loading', 'ready', 'failed', 'unavailable'))
);

CREATE TABLE "PostalCode" (
  "countryCode" TEXT NOT NULL,
  "postalKey" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "postalCode" TEXT NOT NULL,
  "city" TEXT,
  "region" TEXT,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "PostalCode_pkey" PRIMARY KEY ("countryCode", "postalKey", "ordinal")
);

-- ---------------------------------------------------------------------------------------------
-- 3. Calendars
-- ---------------------------------------------------------------------------------------------

-- A saved view and a personal list layout remember the calendar layout's date, end date and color fields and its
-- month, week or agenda mode. NULL keeps every existing view as it is, and older releases never read the column.
ALTER TABLE "DataView" ADD COLUMN "calendar" JSONB;
ALTER TABLE "P13n" ADD COLUMN "calendar" JSONB;

-- Calendar and map widgets share the Widget table with charts and activity timelines. Each kind keeps its own
-- definition column, so the new columns stay NULL on every existing row and older code never reads them.
--
-- The two labels are only added here: nothing in this file uses them as a value, so adding them inside the
-- migration transaction is safe, and no existing row changes. The previous release keeps serving every existing
-- widget while this migration runs at the start of a build; it cannot read a widget of the new kinds, which only
-- exist once this release serves requests.
ALTER TYPE "WidgetKind" ADD VALUE 'calendar';
ALTER TYPE "WidgetKind" ADD VALUE 'map';

ALTER TABLE "Widget" ADD COLUMN "calendarQuery" JSONB;
ALTER TABLE "Widget" ADD COLUMN "mapQuery" JSONB;

-- Private, revocable calendar subscriptions of a member. Only the SHA-256 hash of a subscription URL's token is stored.
CREATE TABLE "CalendarSubscription" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "config" JSONB NOT NULL,
  "includePersonalEvents" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalendarSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarSubscription_tokenHash_key" ON "CalendarSubscription"("tokenHash");
CREATE INDEX "CalendarSubscription_companyId_userId_idx" ON "CalendarSubscription"("companyId", "userId");

ALTER TABLE "CalendarSubscription" ADD CONSTRAINT "CalendarSubscription_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarSubscription" ADD CONSTRAINT "CalendarSubscription_companyId_userId_fkey"
  FOREIGN KEY ("companyId", "userId") REFERENCES "User"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- 4. Contact details: phone and email fields become identities of the list's contact details field
-- ---------------------------------------------------------------------------------------------

-- A record identity gets its own provider enum with "phone" next to the messaging providers, so "phone" can never
-- become a connectable messaging account. The previous release still writes "MessagingProvider" values into it while
-- this release deploys and after a rollback, so they convert on assignment. README.md says when to drop the cast.
CREATE TYPE "RecordIdentityProvider" AS ENUM ('google', 'outlook', 'mail', 'linkedin', 'whatsapp', 'instagram', 'telegram', 'phone');

ALTER TABLE "RecordIdentity"
  ALTER COLUMN "provider" TYPE "RecordIdentityProvider" USING ("provider"::text::"RecordIdentityProvider");

CREATE CAST ("MessagingProvider" AS "RecordIdentityProvider") WITH INOUT AS ASSIGNMENT;

-- Field and option names compare like recordNameKey in features/records/record-names.ts (the same helpers as the
-- dynamic record model migration): Unicode NFD without combining accents, collapsed JavaScript whitespace, trimmed
-- and lowercased. A taken name becomes the first free "name (n)" from 2 on.
CREATE FUNCTION pg_temp.contact_details_name_key(value text) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT lower(btrim(regexp_replace(
    regexp_replace(normalize(coalesce(value, ''), NFD), '[̀-ͯ]', '', 'g'),
    '[\t\n\v\f\r    -     　﻿]+', ' ', 'g'
  )))
$fn$;

CREATE FUNCTION pg_temp.contact_details_free_name(base text, taken text[]) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  WITH RECURSIVE attempt(n, name) AS (
    SELECT 1, base
    UNION ALL
    SELECT attempt.n + 1, base || ' (' || (attempt.n + 1) || ')'
    FROM attempt
    WHERE pg_temp.contact_details_name_key(attempt.name) = ANY (taken)
  )
  SELECT name FROM attempt ORDER BY n DESC LIMIT 1
$fn$;

-- The default name of the contact details field in each app language (Common.table.columns.channels), and the
-- earlier default names it replaces: the former "Channels" in each language, also with the " (n)" the dynamic record
-- model migration added when a list already had a field of that name.
CREATE FUNCTION pg_temp.contact_details_label(language text) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE language
    WHEN 'de' THEN 'Kontaktdaten'
    WHEN 'es' THEN 'Datos de contacto'
    WHEN 'fr' THEN 'Coordonnées'
    WHEN 'it' THEN 'Recapiti'
    ELSE 'Contact details'
  END
$fn$;

CREATE FUNCTION pg_temp.contact_details_former_language(label text) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE regexp_replace(pg_temp.contact_details_name_key(label), ' \([0-9]+\)$', '')
    WHEN 'channels' THEN 'en'
    WHEN 'kanale' THEN 'de'
    WHEN 'canales' THEN 'es'
    WHEN 'canaux' THEN 'fr'
    WHEN 'canali' THEN 'it'
  END
$fn$;

-- The value a phone or email field held as it becomes an identity value, or NULL when it is not one: a phone value
-- must already be E.164 (earlier releases stored phone fields that way), an email address must pass the check the
-- application uses (z.email() of Zod 4) and is stored in lowercase like normalizeChannelValue does.
CREATE FUNCTION pg_temp.contact_details_identity_value(value_type text, raw text) RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN value_type = 'phone' AND btrim(raw) ~ '^\+[1-9][0-9]{6,14}$' THEN btrim(raw)
    WHEN value_type = 'email' AND length(btrim(raw)) <= 2000
      AND btrim(raw) ~ '^(?!\.)(?!.*\.\.)([A-Za-z0-9_''+.-]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$'
      THEN lower(btrim(raw))
  END
$fn$;

-- True when a JSON value mentions one of the field ids anywhere (field ids are UUIDs).
CREATE FUNCTION pg_temp.contact_details_mentions(value jsonb, ids text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT value IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(ids) AS id WHERE value::text LIKE '%' || id || '%')
$fn$;

-- A JSON array without the strings that are one of the field ids; any other JSON value unchanged.
CREATE FUNCTION pg_temp.contact_details_without_ids(items jsonb, ids text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN jsonb_typeof(items) = 'array' THEN coalesce((
    SELECT jsonb_agg(item.value ORDER BY item.ordinality)
    FROM jsonb_array_elements(items) WITH ORDINALITY AS item(value, ordinality)
    WHERE NOT (jsonb_typeof(item.value) = 'string' AND item.value #>> '{}' = ANY (ids))
  ), '[]'::jsonb) ELSE items END
$fn$;

-- A JSON array of field ids where the first of the moved fields becomes the contact details field, unless the array
-- already has it, and the other moved fields are dropped. Any other JSON value unchanged.
CREATE FUNCTION pg_temp.contact_details_repoint_ids(items jsonb, ids text[], target text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN jsonb_typeof(items) IS DISTINCT FROM 'array' THEN items
    WHEN items @> jsonb_build_array(target) THEN pg_temp.contact_details_without_ids(items, ids)
    ELSE coalesce((
      SELECT jsonb_agg(CASE WHEN item.ordinality = first.ordinality THEN to_jsonb(target) ELSE item.value END
        ORDER BY item.ordinality)
      FROM jsonb_array_elements(items) WITH ORDINALITY AS item(value, ordinality)
      LEFT JOIN LATERAL (
        SELECT min(candidate.ordinality) AS ordinality
        FROM jsonb_array_elements(items) WITH ORDINALITY AS candidate(value, ordinality)
        WHERE jsonb_typeof(candidate.value) = 'string' AND candidate.value #>> '{}' = ANY (ids)
      ) first ON true
      WHERE item.ordinality = first.ordinality
        OR NOT (jsonb_typeof(item.value) = 'string' AND item.value #>> '{}' = ANY (ids))
    ), '[]'::jsonb)
  END
$fn$;

CREATE FUNCTION pg_temp.contact_details_repoint_columns(items text[], ids text[], target text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN items IS NULL THEN NULL ELSE coalesce(ARRAY(
    SELECT value FROM jsonb_array_elements_text(pg_temp.contact_details_repoint_ids(to_jsonb(items), ids, target))
      WITH ORDINALITY AS item(value, ordinality)
    ORDER BY ordinality
  ), ARRAY[]::text[]) END
$fn$;

CREATE FUNCTION pg_temp.contact_details_without_columns(items text[], ids text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN items IS NULL THEN NULL ELSE coalesce((
    SELECT array_agg(item.value ORDER BY item.ordinality)
    FROM unnest(items) WITH ORDINALITY AS item(value, ordinality)
    WHERE item.value <> ALL (ids)
  ), ARRAY[]::text[]) END
$fn$;

-- Column widths: the contact details column takes the width of the first moved column it replaces.
CREATE FUNCTION pg_temp.contact_details_repoint_widths(widths jsonb, ids text[], target text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN jsonb_typeof(widths) IS DISTINCT FROM 'object' THEN widths
    WHEN widths ? target THEN widths - ids
    ELSE (widths - ids) || coalesce((
      SELECT jsonb_build_object(target, widths -> entry.id)
      FROM unnest(ids) WITH ORDINALITY AS entry(id, ordinality)
      WHERE widths ? entry.id
      ORDER BY entry.ordinality LIMIT 1
    ), '{}'::jsonb)
  END
$fn$;

-- A JSON array without the objects whose key holds one of the field ids.
CREATE FUNCTION pg_temp.contact_details_without_keyed(items jsonb, key text, ids text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN jsonb_typeof(items) = 'array' THEN coalesce((
    SELECT jsonb_agg(item.value ORDER BY item.ordinality)
    FROM jsonb_array_elements(items) WITH ORDINALITY AS item(value, ordinality)
    WHERE NOT coalesce(item.value ->> key = ANY (ids), false)
  ), '[]'::jsonb) ELSE items END
$fn$;

-- Filters on a moved field that the contact details field can answer move to it: contains and startsWith stay,
-- equals becomes contains (an address or number then matches the identity that holds it), and "has a value" stays.
-- Every other filter on a moved field is dropped, as a field deletion drops it. key and the operator names differ
-- between saved views (field, equals, isNotNull) and record queries (fieldId, eq, notEmpty).
CREATE FUNCTION pg_temp.contact_details_repoint_filters(items jsonb, key text, ids text[], target text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN jsonb_typeof(items) = 'array' THEN coalesce((
    SELECT jsonb_agg(CASE
        WHEN NOT coalesce(item.value ->> key = ANY (ids), false) THEN item.value
        WHEN item.value ->> 'operator' IN ('equals', 'eq')
          THEN item.value || jsonb_build_object(key, target, 'operator', 'contains')
        ELSE item.value || jsonb_build_object(key, target)
      END ORDER BY item.ordinality)
    FROM jsonb_array_elements(items) WITH ORDINALITY AS item(value, ordinality)
    WHERE NOT coalesce(item.value ->> key = ANY (ids), false)
      OR item.value ->> 'operator' IN ('contains', 'startsWith', 'equals', 'eq', 'isNotNull', 'notEmpty')
  ), '[]'::jsonb) ELSE items END
$fn$;

-- A JSON array without the elements that mention one of the field ids.
CREATE FUNCTION pg_temp.contact_details_without_mentions(items jsonb, ids text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN jsonb_typeof(items) = 'array' THEN coalesce((
    SELECT jsonb_agg(item.value ORDER BY item.ordinality)
    FROM jsonb_array_elements(items) WITH ORDINALITY AS item(value, ordinality)
    WHERE NOT pg_temp.contact_details_mentions(item.value, ids)
  ), '[]'::jsonb) ELSE items END
$fn$;

-- A saved grouping without the moved fields: grouping by one of them ends, totals over them are dropped.
CREATE FUNCTION pg_temp.contact_details_grouping(saved jsonb, ids text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN jsonb_typeof(saved) <> 'object' THEN saved
    WHEN saved ->> 'field' = ANY (ids) THEN NULL
    WHEN jsonb_typeof(saved -> 'summaries') = 'array'
      THEN jsonb_set(saved, '{summaries}', pg_temp.contact_details_without_keyed(saved -> 'summaries', 'fieldId', ids))
    ELSE saved
  END
$fn$;

-- A widget measure after the move, as cleanRecordMeasure leaves it for the dropped parts: filters on the moved fields
-- move to the contact details field where it can answer them, related filters and a group filter that use them are
-- removed, and a grouping by one of them ends (the widget then shows the total).
CREATE FUNCTION pg_temp.contact_details_measure(measure jsonb, ids text[], target text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT jsonb_set(
    jsonb_set(measure, '{source}', (measure -> 'source')
      || jsonb_build_object('filters', pg_temp.contact_details_repoint_filters(coalesce(measure #> '{source,filters}', '[]'), 'fieldId', ids, target))
      || CASE WHEN jsonb_typeof(measure #> '{source,relatedFilters}') = 'array'
        THEN jsonb_build_object('relatedFilters', pg_temp.contact_details_without_mentions(measure #> '{source,relatedFilters}', ids))
        ELSE '{}'::jsonb END),
    '{groupBy}',
    CASE
      WHEN jsonb_typeof(measure -> 'groupBy') IS DISTINCT FROM 'object' THEN coalesce(measure -> 'groupBy', 'null'::jsonb)
      WHEN measure #>> '{groupBy,fieldId}' = ANY (ids) THEN 'null'::jsonb
      WHEN pg_temp.contact_details_mentions(measure #> '{groupBy,filter}', ids) THEN (measure -> 'groupBy') - 'filter'
      ELSE measure -> 'groupBy'
    END)
$fn$;

-- A phone or email field kept as text: the click action belongs to contact values only.
CREATE FUNCTION pg_temp.contact_details_as_text(field jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT jsonb_set(
    CASE WHEN jsonb_typeof(field -> 'format') = 'object' THEN jsonb_set(field, '{format}', (field -> 'format') - 'onClick') ELSE field END,
    '{valueType}', '"text"')
$fn$;

-- The workspaces whose current record model has a phone or email field or a contact details field that still carries
-- a former default name, with that model and the language new fields are named in: the first administrator's, English
-- when it follows the browser.
CREATE TEMP TABLE contact_details_workspace ON COMMIT DROP AS
SELECT state."companyId" AS company_id, state.revision, revision.snapshot AS model,
  coalesce((
    SELECT nullif(member."displayLanguage"::text, 'system')
    FROM "User" member
    JOIN "UserRole" role ON role.id = member."roleId" AND role."isSystemRole"
    WHERE member."companyId" = state."companyId"
    ORDER BY member."createdAt", member.id
    LIMIT 1
  ), 'en') AS language
FROM "RecordSchemaState" state
JOIN "RecordSchemaRevision" revision ON revision."companyId" = state."companyId" AND revision.revision = state.revision
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(revision.snapshot -> 'fields') AS field(value)
  WHERE field.value ->> 'valueType' IN ('phone', 'email')
    OR (field.value ->> 'valueType' = 'channels' AND pg_temp.contact_details_former_language(field.value ->> 'label') IS NOT NULL)
);

-- Contact details fields that still carry a former default name ("Channels" in any app language) get the new default
-- name of the same language, unless another field of the list (also one in Trash) already has it.
CREATE TEMP TABLE contact_details_renamed ON COMMIT DROP AS
SELECT workspace.company_id, field.value ->> 'id' AS field_id,
  pg_temp.contact_details_label(pg_temp.contact_details_former_language(field.value ->> 'label')) AS label
FROM contact_details_workspace workspace
CROSS JOIN LATERAL jsonb_array_elements(workspace.model -> 'fields') AS field(value)
WHERE field.value ->> 'valueType' = 'channels'
  AND pg_temp.contact_details_former_language(field.value ->> 'label') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(workspace.model -> 'fields') AS other(value)
    WHERE other.value ->> 'typeId' = field.value ->> 'typeId' AND other.value ->> 'id' <> field.value ->> 'id'
      AND pg_temp.contact_details_name_key(other.value ->> 'label') = pg_temp.contact_details_name_key(
        pg_temp.contact_details_label(pg_temp.contact_details_former_language(field.value ->> 'label')))
  );

-- Every phone and email field, with the reason it stays a text field, or no reason when the contact details field
-- takes it over. The first matching reason applies; README.md's inventory lists the same before deploying.
CREATE TEMP TABLE contact_details_field ON COMMIT DROP AS
SELECT workspace.company_id, field.value ->> 'id' AS field_id, field.value ->> 'typeId' AS type_id,
  field.value ->> 'valueType' AS value_type, coalesce((field.value ->> 'position')::integer, 0) AS position, CASE
  WHEN coalesce((field.value ->> 'archived')::boolean, false) THEN 'field in Trash'
  WHEN list.value IS NULL OR coalesce((list.value ->> 'archived')::boolean, false) THEN 'list in Trash'
  WHEN coalesce((list.value ->> 'embedded')::boolean, false) THEN 'sub-list'
  WHEN field.value #>> '{behavior,kind}' IS DISTINCT FROM 'input' THEN 'calculated field'
  WHEN list.value ->> 'primaryFieldId' = field.value ->> 'id' THEN 'name field of the list'
  WHEN EXISTS (
    SELECT 1 FROM jsonb_array_elements(workspace.model -> 'fields') AS other(value)
    WHERE other.value ->> 'id' <> field.value ->> 'id'
      AND pg_temp.contact_details_mentions(other.value -> 'behavior', ARRAY[field.value ->> 'id'])
  ) THEN 'used by a calculation'
  WHEN EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(workspace.model -> 'capabilities', '[]'::jsonb)) AS binding(value)
    CROSS JOIN LATERAL jsonb_array_elements(binding.value -> 'fields') AS entry(value)
    WHERE entry.value ->> 'fieldId' = field.value ->> 'id'
  ) THEN 'used by a binding'
  WHEN EXISTS (
    SELECT 1 FROM "RecordEventSubscription" subscription
    WHERE subscription."companyId" = workspace.company_id
      AND (field.value ->> 'id' = ANY (subscription."changedFieldIds")
        OR pg_temp.contact_details_mentions(subscription.query, ARRAY[field.value ->> 'id'])
        OR pg_temp.contact_details_mentions(subscription.sources, ARRAY[field.value ->> 'id']))
  ) OR EXISTS (
    SELECT 1 FROM "Routine" routine
    WHERE routine."companyId" = workspace.company_id
      AND pg_temp.contact_details_mentions(routine."triggerFilters", ARRAY[field.value ->> 'id'])
  ) OR EXISTS (
    SELECT 1 FROM "Webhook" webhook
    WHERE webhook."companyId" = workspace.company_id AND webhook."bodyTemplate" LIKE '%' || (field.value ->> 'id') || '%'
  ) THEN 'used by a routine or webhook'
  WHEN EXISTS (
    SELECT 1 FROM jsonb_array_elements(workspace.model -> 'fields') AS other(value)
    WHERE other.value ->> 'typeId' = field.value ->> 'typeId' AND other.value ->> 'valueType' = 'channels'
      AND coalesce((other.value ->> 'archived')::boolean, false)
  ) THEN 'contact details field in Trash'
  WHEN EXISTS (
    SELECT 1 FROM "RecordValue" value
    CROSS JOIN LATERAL unnest(CASE WHEN value."textValue" IS NOT NULL THEN ARRAY[value."textValue"] ELSE value."textListValue" END) AS entry
    WHERE value."companyId" = workspace.company_id AND value."typeId" = field.value ->> 'typeId'
      AND value."fieldId" = field.value ->> 'id' AND value.state = 'value'
      AND pg_temp.contact_details_identity_value(field.value ->> 'valueType', entry) IS NULL
  ) THEN CASE field.value ->> 'valueType'
    WHEN 'phone' THEN 'values that are not phone numbers'
    ELSE 'values that are not email addresses'
  END
END AS reason
FROM contact_details_workspace workspace
CROSS JOIN LATERAL jsonb_array_elements(workspace.model -> 'fields') AS field(value)
LEFT JOIN LATERAL (
  SELECT list.value FROM jsonb_array_elements(workspace.model -> 'types') AS list(value)
  WHERE list.value ->> 'id' = field.value ->> 'typeId'
) list ON true
WHERE field.value ->> 'valueType' IN ('phone', 'email');

-- A workspace whose only candidate keeps its name, because the new name is taken, stays as it is.
DELETE FROM contact_details_workspace workspace
WHERE NOT EXISTS (SELECT 1 FROM contact_details_renamed renamed WHERE renamed.company_id = workspace.company_id)
  AND NOT EXISTS (SELECT 1 FROM contact_details_field field WHERE field.company_id = workspace.company_id);

-- A background operation of the previous revision would fail with recordSchemaChanged on its next step anyway; end it
-- now and release the workspace.
WITH ended AS (
  UPDATE "RecordOperation" operation
  SET state = 'failed', "errorCode" = 'recordSchemaChanged', "leaseUntil" = NULL, "updatedAt" = now()
  FROM contact_details_workspace workspace
  WHERE operation."companyId" = workspace.company_id AND operation.state IN ('pending', 'staging')
  RETURNING operation."companyId", operation.id
)
DELETE FROM "RecordStageRow" row USING ended
WHERE row."companyId" = ended."companyId" AND row."operationId" = ended.id;

UPDATE "RecordSchemaState" state SET "activeOperationId" = NULL
FROM contact_details_workspace workspace WHERE state."companyId" = workspace.company_id;

UPDATE contact_details_workspace workspace SET model = jsonb_set(workspace.model, '{fields}', coalesce((
  SELECT jsonb_agg(CASE WHEN renamed.field_id IS NULL THEN field.value
      ELSE jsonb_set(field.value, '{label}', to_jsonb(renamed.label)) END ORDER BY field.ordinality)
  FROM jsonb_array_elements(workspace.model -> 'fields') WITH ORDINALITY AS field(value, ordinality)
  LEFT JOIN contact_details_renamed renamed
    ON renamed.company_id = workspace.company_id AND renamed.field_id = field.value ->> 'id'
), '[]'::jsonb))
WHERE EXISTS (SELECT 1 FROM contact_details_renamed renamed WHERE renamed.company_id = workspace.company_id);

UPDATE "RecordFieldDefinition" definition SET
  definition = jsonb_set(definition.definition, '{label}', to_jsonb(renamed.label)),
  "updatedAt" = now()
FROM contact_details_renamed renamed
WHERE definition."companyId" = renamed.company_id AND definition.id = renamed.field_id;

-- Every list that takes over a phone or email field keeps its values in its contact details field: the one it has,
-- or a new one after its other fields, named like the configuration service names new definitions. A click action the
-- moved fields agree on carries over; the field otherwise opens a value.
CREATE TEMP TABLE contact_details_target ON COMMIT DROP AS
WITH lists AS (
  SELECT DISTINCT company_id, type_id FROM contact_details_field WHERE reason IS NULL
)
SELECT lists.company_id, lists.type_id, existing.field_id, NULL::jsonb AS created
FROM lists
JOIN contact_details_workspace workspace ON workspace.company_id = lists.company_id
CROSS JOIN LATERAL (
  SELECT other.value ->> 'id' AS field_id
  FROM jsonb_array_elements(workspace.model -> 'fields') WITH ORDINALITY AS other(value, ordinality)
  WHERE other.value ->> 'typeId' = lists.type_id AND other.value ->> 'valueType' = 'channels'
  ORDER BY other.ordinality
  LIMIT 1
) existing
UNION ALL
SELECT lists.company_id, lists.type_id, created.field ->> 'id', created.field
FROM lists
JOIN contact_details_workspace workspace ON workspace.company_id = lists.company_id
CROSS JOIN LATERAL (
  SELECT jsonb_build_object(
    'id', gen_random_uuid()::text,
    'typeId', lists.type_id,
    'label', pg_temp.contact_details_free_name(pg_temp.contact_details_label(workspace.language), coalesce((
      SELECT array_agg(pg_temp.contact_details_name_key(other.value ->> 'label'))
      FROM jsonb_array_elements(workspace.model -> 'fields') AS other(value)
      WHERE other.value ->> 'typeId' = lists.type_id
        AND NOT EXISTS (
          SELECT 1 FROM contact_details_field moved
          WHERE moved.company_id = lists.company_id AND moved.field_id = other.value ->> 'id' AND moved.reason IS NULL
        )
    ), ARRAY[]::text[])),
    'valueType', 'channels',
    'behavior', '{"kind":"input"}'::jsonb,
    'required', false,
    'format', jsonb_build_object('providerAvatar', false) || coalesce((
      SELECT jsonb_build_object('onClick', min(field.value #>> '{format,onClick}'))
      FROM contact_details_field moved
      JOIN jsonb_array_elements(workspace.model -> 'fields') AS field(value) ON field.value ->> 'id' = moved.field_id
      WHERE moved.company_id = lists.company_id AND moved.type_id = lists.type_id AND moved.reason IS NULL
      HAVING count(DISTINCT coalesce(field.value #>> '{format,onClick}', 'open')) = 1
        AND min(field.value #>> '{format,onClick}') IS NOT NULL
    ), '{}'::jsonb),
    'archived', false,
    'publishedSummary', false,
    'options', '[]'::jsonb,
    'position', (
      SELECT coalesce(max((other.value ->> 'position')::integer), -1) + 1
      FROM jsonb_array_elements(workspace.model -> 'fields') AS other(value)
      WHERE other.value ->> 'typeId' = lists.type_id
    )) AS field
) created
WHERE NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(workspace.model -> 'fields') AS other(value)
  WHERE other.value ->> 'typeId' = lists.type_id AND other.value ->> 'valueType' = 'channels'
);

INSERT INTO "RecordFieldDefinition" ("companyId", "typeId", id, "valueType", behavior, archived, definition, "createdAt", "updatedAt")
SELECT company_id, type_id, field_id, 'channels', 'input', false, created, now(), now()
FROM contact_details_target WHERE created IS NOT NULL;

-- The values: one identity per number or address of the workspace, reused when it exists (a number also as a WhatsApp
-- identity, an address also as a Gmail or Outlook identity), linked to every record that has it, trashed records
-- included.
CREATE TEMP TABLE contact_details_value ON COMMIT DROP AS
SELECT DISTINCT moved.company_id, value."typeId" AS type_id, value."recordId" AS record_id,
  moved.value_type AS channel_class, pg_temp.contact_details_identity_value(moved.value_type, entry) AS value
FROM contact_details_field moved
JOIN "RecordValue" value ON value."companyId" = moved.company_id AND value."typeId" = moved.type_id
  AND value."fieldId" = moved.field_id AND value.state = 'value'
CROSS JOIN LATERAL unnest(CASE WHEN value."textValue" IS NOT NULL THEN ARRAY[value."textValue"] ELSE value."textListValue" END) AS entry
WHERE moved.reason IS NULL;

WITH missing AS (
  SELECT DISTINCT company_id, channel_class, value FROM contact_details_value wanted
  WHERE NOT EXISTS (
    SELECT 1 FROM "RecordIdentityKey" known
    WHERE known."companyId" = wanted.company_id AND known."channelClass" = wanted.channel_class AND known.value = wanted.value
  )
), created AS (
  INSERT INTO "RecordIdentity" ("companyId", id, provider, "channelClass", value, "messagingId", "displayName", "profileUrl", "createdAt", "updatedAt")
  SELECT company_id, gen_random_uuid()::text,
    (CASE channel_class WHEN 'phone' THEN 'phone' ELSE 'mail' END)::"RecordIdentityProvider",
    channel_class, value, NULL, NULL, NULL, now(), now()
  FROM missing
  RETURNING "companyId", id, "channelClass", value
)
INSERT INTO "RecordIdentityKey" ("companyId", "channelClass", value, "identityId")
SELECT "companyId", "channelClass", value, id FROM created;

INSERT INTO "RecordIdentityLink" ("companyId", "identityId", "typeId", "recordId", "createdAt")
SELECT DISTINCT wanted.company_id, known."identityId", wanted.type_id, wanted.record_id, now()
FROM contact_details_value wanted
JOIN "RecordIdentityKey" known
  ON known."companyId" = wanted.company_id AND known."channelClass" = wanted.channel_class AND known.value = wanted.value
ON CONFLICT DO NOTHING;

-- Remove the moved fields with their values. Their saved-view, layout and widget references move to the contact
-- details field where it can stand in for them and are cleaned like a field deletion cleans them otherwise.
DELETE FROM "RecordFieldDefinition" definition
USING contact_details_field moved
WHERE definition."companyId" = moved.company_id AND definition.id = moved.field_id AND moved.reason IS NULL;

CREATE TEMP TABLE contact_details_moved ON COMMIT DROP AS
SELECT moved.company_id, moved.type_id, target.field_id AS target_id,
  array_agg(moved.field_id ORDER BY moved.position, moved.field_id) AS ids,
  row_number() OVER (PARTITION BY moved.company_id ORDER BY moved.type_id) AS step
FROM contact_details_field moved
JOIN contact_details_target target ON target.company_id = moved.company_id AND target.type_id = moved.type_id
WHERE moved.reason IS NULL
GROUP BY moved.company_id, moved.type_id, target.field_id;

UPDATE "DataView" view SET
  "columnOrder" = pg_temp.contact_details_repoint_ids(view."columnOrder", moved.ids, moved.target_id),
  "hiddenColumns" = pg_temp.contact_details_without_ids(view."hiddenColumns", moved.ids),
  "columnWidths" = pg_temp.contact_details_repoint_widths(view."columnWidths", moved.ids, moved.target_id),
  filters = pg_temp.contact_details_repoint_filters(view.filters, 'field', moved.ids, moved.target_id),
  "sortDescriptor" = CASE WHEN view."sortDescriptor" ->> 'field' = ANY (moved.ids) THEN '{}'::jsonb ELSE view."sortDescriptor" END,
  grouping = pg_temp.contact_details_grouping(view.grouping, moved.ids),
  "groupingColumnId" = CASE WHEN view."groupingColumnId" = ANY (moved.ids) THEN NULL ELSE view."groupingColumnId" END,
  "updatedAt" = now()
FROM contact_details_moved moved
WHERE view."companyId" = moved.company_id AND view."surfaceKey" = 'records:' || moved.type_id
  AND pg_temp.contact_details_mentions(to_jsonb(view) - 'name', moved.ids);

UPDATE "P13n" personalization SET
  "columnOrder" = pg_temp.contact_details_repoint_columns(personalization."columnOrder", moved.ids, moved.target_id),
  "hiddenColumns" = pg_temp.contact_details_without_columns(personalization."hiddenColumns", moved.ids),
  "columnWidths" = pg_temp.contact_details_repoint_widths(personalization."columnWidths", moved.ids, moved.target_id),
  filters = pg_temp.contact_details_repoint_filters(personalization.filters, 'field', moved.ids, moved.target_id),
  "sortDescriptor" = CASE WHEN personalization."sortDescriptor" ->> 'field' = ANY (moved.ids) THEN '{}'::jsonb ELSE personalization."sortDescriptor" END,
  grouping = pg_temp.contact_details_grouping(personalization.grouping, moved.ids),
  "groupingColumnId" = CASE WHEN personalization."groupingColumnId" = ANY (moved.ids) THEN NULL ELSE personalization."groupingColumnId" END,
  "updatedAt" = now()
FROM contact_details_moved moved
WHERE personalization."companyId" = moved.company_id AND personalization."p13nId" = 'records:' || moved.type_id
  AND pg_temp.contact_details_mentions(to_jsonb(personalization), moved.ids);

UPDATE "P13n" personalization SET
  "detailOptions" = personalization."detailOptions" || jsonb_build_object(
    'starredFieldIds', pg_temp.contact_details_repoint_ids(coalesce(personalization."detailOptions" -> 'starredFieldIds', '[]'::jsonb), moved.ids, moved.target_id),
    'hiddenFieldIds', pg_temp.contact_details_without_ids(coalesce(personalization."detailOptions" -> 'hiddenFieldIds', '[]'::jsonb), moved.ids),
    'fieldOrder', pg_temp.contact_details_repoint_ids(
      coalesce(personalization."detailOptions" -> 'fieldOrder', to_jsonb(personalization."columnOrder"), '[]'::jsonb), moved.ids, moved.target_id)),
  "updatedAt" = now()
FROM contact_details_moved moved
WHERE personalization."companyId" = moved.company_id AND personalization."p13nId" = 'record-detail:' || moved.type_id
  AND jsonb_typeof(personalization."detailOptions") = 'object'
  AND pg_temp.contact_details_mentions(jsonb_build_array(
    personalization."detailOptions" -> 'starredFieldIds',
    personalization."detailOptions" -> 'hiddenFieldIds',
    coalesce(personalization."detailOptions" -> 'fieldOrder', to_jsonb(personalization."columnOrder"))), moved.ids);

-- A widget measure can mention moved fields of several lists: it passes through each list's move in turn, and its
-- version counts every change.
WITH RECURSIVE pass (id, measure, step, changes) AS (
  SELECT widget.id, widget.measure, 0::bigint, 0
  FROM "Widget" widget
  WHERE jsonb_typeof(widget.measure) = 'object'
    AND EXISTS (
      SELECT 1 FROM contact_details_moved moved
      WHERE moved.company_id = widget."companyId" AND pg_temp.contact_details_mentions(widget.measure, moved.ids)
    )
  UNION ALL
  SELECT pass.id,
    CASE WHEN pg_temp.contact_details_mentions(pass.measure, moved.ids)
      THEN pg_temp.contact_details_measure(pass.measure, moved.ids, moved.target_id) ELSE pass.measure END,
    moved.step,
    pass.changes + CASE WHEN pg_temp.contact_details_mentions(pass.measure, moved.ids) THEN 1 ELSE 0 END
  FROM pass
  JOIN "Widget" widget ON widget.id = pass.id
  JOIN contact_details_moved moved ON moved.company_id = widget."companyId" AND moved.step = pass.step + 1
)
UPDATE "Widget" widget SET measure = last.measure, version = widget.version + last.changes, "updatedAt" = now()
FROM (SELECT DISTINCT ON (id) id, measure, changes FROM pass ORDER BY id, step DESC) last
WHERE widget.id = last.id AND last.changes > 0;

-- The fields the contact details field cannot take over become text fields with their values.
UPDATE "RecordFieldDefinition" definition SET
  "valueType" = 'text',
  definition = pg_temp.contact_details_as_text(field.value),
  "updatedAt" = now()
FROM contact_details_field kept
JOIN contact_details_workspace workspace ON workspace.company_id = kept.company_id
CROSS JOIN LATERAL jsonb_array_elements(workspace.model -> 'fields') AS field(value)
WHERE field.value ->> 'id' = kept.field_id AND kept.reason IS NOT NULL
  AND definition."companyId" = kept.company_id AND definition.id = kept.field_id;

-- Configuration revision of every changed workspace: the new model and a history entry that names every change.
INSERT INTO "RecordSchemaRevision" ("companyId", revision, "actorId", snapshot, change, "createdAt")
SELECT workspace.company_id, workspace.revision + 1, 'system:contact-details-upgrade',
  jsonb_set(jsonb_set(workspace.model, '{revision}', to_jsonb(workspace.revision + 1)), '{fields}', coalesce((
    SELECT jsonb_agg(CASE WHEN kept.reason IS NOT NULL THEN pg_temp.contact_details_as_text(field.value) ELSE field.value END
      ORDER BY field.ordinality)
    FROM jsonb_array_elements(workspace.model -> 'fields') WITH ORDINALITY AS field(value, ordinality)
    LEFT JOIN contact_details_field kept ON kept.company_id = workspace.company_id AND kept.field_id = field.value ->> 'id'
    WHERE kept.field_id IS NULL OR kept.reason IS NOT NULL
  ), '[]'::jsonb) || coalesce((
    SELECT jsonb_agg(target.created ORDER BY target.type_id)
    FROM contact_details_target target WHERE target.company_id = workspace.company_id AND target.created IS NOT NULL
  ), '[]'::jsonb)),
  jsonb_build_object(
    'version', 1,
    'source', jsonb_build_object('kind', 'configuration'),
    'causeId', 'contact-details-upgrade',
    'expectedRevision', workspace.revision,
    'configuration', jsonb_build_object(
      'expectedRevision', workspace.revision,
      'idempotencyKey', 'contact-details-upgrade',
      'operations', coalesce((
        SELECT jsonb_agg(entry.operation ORDER BY entry.sort, entry.ordinality)
        FROM (
          SELECT 1 AS sort, field.ordinality,
            jsonb_build_object('operation', 'putField', 'field', field.value - 'publishedSummary' - 'archived') AS operation
          FROM jsonb_array_elements(workspace.model -> 'fields') WITH ORDINALITY AS field(value, ordinality)
          JOIN contact_details_renamed renamed
            ON renamed.company_id = workspace.company_id AND renamed.field_id = field.value ->> 'id'
          UNION ALL
          SELECT 2, row_number() OVER (ORDER BY target.type_id),
            jsonb_build_object('operation', 'putField', 'field', target.created - 'publishedSummary')
          FROM contact_details_target target
          WHERE target.company_id = workspace.company_id AND target.created IS NOT NULL
          UNION ALL
          SELECT 3, field.ordinality,
            CASE WHEN moved.reason IS NULL
              THEN jsonb_build_object('operation', 'deletePermanently', 'target', jsonb_build_object('kind', 'field', 'id', moved.field_id))
              ELSE jsonb_build_object('operation', 'putField', 'field', pg_temp.contact_details_as_text(field.value) - 'publishedSummary' - 'archived')
            END
          FROM jsonb_array_elements(workspace.model -> 'fields') WITH ORDINALITY AS field(value, ordinality)
          JOIN contact_details_field moved ON moved.company_id = workspace.company_id AND moved.field_id = field.value ->> 'id'
        ) entry
      ), '[]'::jsonb)),
    'references', '[]'::jsonb,
    'grants', '[]'::jsonb),
  now()
FROM contact_details_workspace workspace;

UPDATE "RecordSchemaState" state SET revision = workspace.revision + 1
FROM contact_details_workspace workspace WHERE state."companyId" = workspace.company_id;

DROP FUNCTION pg_temp.contact_details_as_text(jsonb);
DROP FUNCTION pg_temp.contact_details_measure(jsonb, text[], text);
DROP FUNCTION pg_temp.contact_details_grouping(jsonb, text[]);
DROP FUNCTION pg_temp.contact_details_without_mentions(jsonb, text[]);
DROP FUNCTION pg_temp.contact_details_repoint_filters(jsonb, text, text[], text);
DROP FUNCTION pg_temp.contact_details_without_keyed(jsonb, text, text[]);
DROP FUNCTION pg_temp.contact_details_repoint_widths(jsonb, text[], text);
DROP FUNCTION pg_temp.contact_details_without_columns(text[], text[]);
DROP FUNCTION pg_temp.contact_details_repoint_columns(text[], text[], text);
DROP FUNCTION pg_temp.contact_details_repoint_ids(jsonb, text[], text);
DROP FUNCTION pg_temp.contact_details_without_ids(jsonb, text[]);
DROP FUNCTION pg_temp.contact_details_mentions(jsonb, text[]);
DROP FUNCTION pg_temp.contact_details_identity_value(text, text);
DROP FUNCTION pg_temp.contact_details_former_language(text);
DROP FUNCTION pg_temp.contact_details_label(text);
DROP FUNCTION pg_temp.contact_details_free_name(text, text[]);
DROP FUNCTION pg_temp.contact_details_name_key(text);

-- The database refuses phone and email fields from then on, so an older application version that still serves
-- requests during the deployment cannot create one.
ALTER TABLE "RecordFieldDefinition" ADD CONSTRAINT "RecordFieldDefinition_valueType_not_retired"
  CHECK ("valueType" NOT IN ('phone', 'email'));
