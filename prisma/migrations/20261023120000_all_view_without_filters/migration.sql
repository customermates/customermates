-- The All view of a list no longer holds filters or a search term. Every personal All state of a surface that offers
-- saved views and still carries them becomes a saved view of its owner, named "Saved filters" in the owner's display
-- language and placed after the owner's other views of that surface. The view copies the All state the list shows
-- today (respecting P13n."viewStateKeys"), the user lands on it when the All view was the one they had open, and the
-- All state keeps everything except its filters and search term. A Members list filtered only to active members gets
-- no view and its owner lands on All. A second run finds nothing to convert.

WITH "candidate" AS MATERIALIZED (
    SELECT
        p."id",
        p."companyId",
        p."userId",
        p."p13nId",
        p."activeViewKey",
        p."filters",
        p."searchTerm",
        p."sortDescriptor",
        p."pagination",
        p."viewMode",
        p."grouping",
        p."groupingColumnId",
        p."columnOrder",
        p."columnWidths",
        p."hiddenColumns",
        COALESCE(jsonb_typeof(p."viewStateKeys") = 'array', false) AS "keyed",
        COALESCE(p."viewStateKeys", '[]'::jsonb) AS "keys"
    FROM "P13n" p
    WHERE (
            p."p13nId" IN (
                'users-card-store',
                'roles-card-store',
                'webhooks-card-store',
                'webhook-deliveries-card-store',
                'messaging-threads-card-store',
                'entity-timeline',
                'activity',
                'operator-users',
                'operator-workspaces',
                'operator-audit',
                'routines-card-store',
                'dashboard'
            )
            OR p."p13nId" LIKE 'records:%'
        )
        AND (
            (jsonb_typeof(p."filters") = 'array' AND jsonb_array_length(p."filters") > 0)
            OR COALESCE(p."searchTerm", '') <> ''
        )
),
"state" AS MATERIALIZED (
    SELECT
        c."id" AS "p13nRowId",
        c."companyId",
        c."userId",
        c."p13nId" AS "surfaceKey",
        c."activeViewKey",
        gen_random_uuid()::text AS "viewId",
        CASE
            WHEN c."keyed" AND NOT c."keys" @> '["filters"]'::jsonb THEN NULL
            WHEN jsonb_typeof(c."filters") = 'array' THEN c."filters"
            WHEN c."keyed" THEN '[]'::jsonb
        END AS "filters",
        CASE
            WHEN c."keyed" AND NOT c."keys" @> '["filters"]'::jsonb THEN false
            ELSE jsonb_typeof(c."filters") = 'array' AND jsonb_array_length(c."filters") > 0
        END AS "hasFilters",
        CASE
            WHEN c."keyed" AND NOT c."keys" @> '["searchTerm"]'::jsonb THEN NULL
            WHEN btrim(COALESCE(c."searchTerm", '')) <> '' THEN c."searchTerm"
        END AS "searchTerm",
        CASE
            WHEN c."keyed" AND NOT c."keys" @> '["sortDescriptor"]'::jsonb THEN NULL
            WHEN c."keyed" THEN COALESCE(NULLIF(c."sortDescriptor", 'null'::jsonb), '{}'::jsonb)
            ELSE NULLIF(c."sortDescriptor", 'null'::jsonb)
        END AS "sortDescriptor",
        CASE
            WHEN c."keyed" AND NOT c."keys" @> '["pageSize"]'::jsonb THEN NULL
            WHEN jsonb_typeof(c."pagination" -> 'pageSize') <> 'number' THEN NULL
            WHEN (c."pagination" ->> 'pageSize') IN ('5', '10', '25', '100') THEN (c."pagination" ->> 'pageSize')::integer
        END AS "pageSize",
        CASE
            WHEN c."keyed" AND NOT c."keys" @> '["viewMode"]'::jsonb THEN NULL
            ELSE c."viewMode"
        END AS "viewMode",
        CASE
            WHEN c."keyed" AND NOT c."keys" @> '["grouping"]'::jsonb THEN NULL
            WHEN jsonb_typeof(c."grouping") = 'object' THEN c."grouping"
        END AS "grouping",
        CASE
            WHEN c."keyed" AND NOT c."keys" @> '["grouping"]'::jsonb THEN NULL
            WHEN jsonb_typeof(c."grouping") = 'object' THEN c."groupingColumnId"
        END AS "groupingColumnId",
        CASE
            WHEN c."keyed" AND NOT c."keys" @> '["columnOrder"]'::jsonb THEN NULL
            ELSE to_jsonb(COALESCE(c."columnOrder", ARRAY[]::text[]))
        END AS "columnOrder",
        CASE
            WHEN c."keyed" AND NOT c."keys" @> '["columnWidths"]'::jsonb THEN NULL
            WHEN jsonb_typeof(c."columnWidths") = 'object' THEN c."columnWidths"
            WHEN c."keyed" THEN '{}'::jsonb
        END AS "columnWidths",
        CASE
            WHEN c."keyed" AND NOT c."keys" @> '["hiddenColumns"]'::jsonb THEN NULL
            ELSE to_jsonb(COALESCE(c."hiddenColumns", ARRAY[]::text[]))
        END AS "hiddenColumns"
    FROM "candidate" c
),
"converted" AS MATERIALIZED (
    SELECT
        s.*,
        CASE u."displayLanguage"::text
            WHEN 'de' THEN 'Gespeicherte Filter'
            WHEN 'es' THEN 'Filtros guardados'
            WHEN 'fr' THEN 'Filtres enregistrés'
            WHEN 'it' THEN 'Filtri salvati'
            ELSE 'Saved filters'
        END AS "baseName",
        COALESCE(
            (
                SELECT max(d."position")
                FROM "DataView" d
                WHERE d."companyId" = s."companyId"
                    AND d."userId" = s."userId"
                    AND d."surfaceKey" = s."surfaceKey"
                    AND d."deletedAt" IS NULL
            ),
            -1
        ) + 1 AS "position",
        NOT EXISTS (
            SELECT 1
            FROM "DataView" d
            WHERE d."id" = s."activeViewKey"
                AND d."companyId" = s."companyId"
                AND d."userId" = s."userId"
                AND d."surfaceKey" = s."surfaceKey"
                AND d."deletedAt" IS NULL
        ) AS "showsAll"
    FROM "state" s
    JOIN "User" u ON u."id" = s."userId"
    WHERE (s."hasFilters" OR s."searchTerm" IS NOT NULL)
        AND NOT (
            s."surfaceKey" = 'users-card-store'
            AND s."searchTerm" IS NULL
            AND s."filters" = '[{"field": "status", "operator": "in", "value": ["active"]}]'::jsonb
        )
),
"named" AS MATERIALIZED (
    SELECT
        c.*,
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM "DataView" d
                WHERE d."companyId" = c."companyId"
                    AND d."userId" = c."userId"
                    AND d."surfaceKey" = c."surfaceKey"
                    AND d."deletedAt" IS NULL
                    AND d."name" = c."baseName"
            ) THEN c."baseName" || ' 2'
            ELSE c."baseName"
        END AS "name"
    FROM "converted" c
),
"inserted" AS (
    INSERT INTO "DataView" (
        "id",
        "companyId",
        "userId",
        "surfaceKey",
        "name",
        "position",
        "filters",
        "searchTerm",
        "sortDescriptor",
        "viewMode",
        "groupingColumnId",
        "grouping",
        "columnOrder",
        "columnWidths",
        "hiddenColumns",
        "pageSize",
        "createdAt",
        "updatedAt"
    )
    SELECT
        n."viewId",
        n."companyId",
        n."userId",
        n."surfaceKey",
        n."name",
        n."position",
        n."filters",
        n."searchTerm",
        n."sortDescriptor",
        n."viewMode",
        n."groupingColumnId",
        n."grouping",
        n."columnOrder",
        n."columnWidths",
        n."hiddenColumns",
        n."pageSize",
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    FROM "named" n
    RETURNING "id"
)
UPDATE "P13n" p
SET
    "filters" = '[]'::jsonb,
    "searchTerm" = NULL,
    "activeViewKey" = CASE WHEN n."showsAll" THEN n."viewId" ELSE p."activeViewKey" END,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "candidate" c
LEFT JOIN "named" n ON n."p13nRowId" = c."id"
WHERE p."id" = c."id";
