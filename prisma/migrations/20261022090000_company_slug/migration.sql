-- AlterTable
ALTER TABLE "Company" ADD COLUMN "slug" TEXT;

-- Backfill readable, deterministic slugs from the workspace name; unnamed workspaces get a hex suffix like new ones
WITH "normalized" AS (
  SELECT
    "id",
    "createdAt",
    trim(BOTH '-' FROM left(trim(BOTH '-' FROM regexp_replace(
      lower(translate(
        replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
          coalesce("name", ''),
          'ä', 'ae'), 'Ä', 'ae'), 'ö', 'oe'), 'Ö', 'oe'), 'ü', 'ue'), 'Ü', 'ue'), 'ß', 'ss'),
          'æ', 'ae'), 'Æ', 'ae'), 'œ', 'oe'), 'Œ', 'oe'), 'þ', 'th'), 'Þ', 'th'), '&', ' and '),
        'àáâãåāăąçćčďđðèéêëēėęěìíîïīįıłñńňòóôõōőøŕřśšşșťțùúûůūűųýÿźżžÀÁÂÃÅĀĂĄÇĆČĎĐÐÈÉÊËĒĖĘĚÌÍÎÏĪĮIŁÑŃŇÒÓÔÕŌŐØŔŘŚŠŞȘŤȚÙÚÛŮŪŰŲÝŸŹŻŽ',
        'aaaaaaaacccdddeeeeeeeeiiiiiiilnnnooooooorrssssttuuuuuuuyyzzzaaaaaaaacccdddeeeeeeeeiiiiiiilnnnooooooorrssssttuuuuuuuyyzzz'
      )),
      '[^a-z0-9]+', '-', 'g'
    )), 40)) AS "raw"
  FROM "Company"
),
"based" AS (
  SELECT
    "id",
    "createdAt",
    CASE
      WHEN "raw" = '' THEN 'workspace'
      WHEN "raw" IN ('admin', 'api', 'app', 'create', 'dashboard', 'default', 'demo', 'new', 'settings', 'w', 'www')
        THEN "raw" || '-workspace'
      ELSE "raw"
    END AS "base"
  FROM "normalized"
),
"ranked" AS (
  SELECT "id", "base", row_number() OVER (PARTITION BY "base" ORDER BY "createdAt", "id") AS "rank"
  FROM "based"
),
"candidates" AS (
  SELECT
    "id",
    "base",
    "rank",
    CASE
      WHEN "base" = 'workspace' THEN 'workspace-' || substr(md5("id"), 1, 6)
      WHEN "rank" = 1 THEN "base"
      ELSE trim(BOTH '-' FROM left("base", 39 - length("rank"::text))) || '-' || "rank"::text
    END AS "candidate"
  FROM "ranked"
),
"resolved" AS (
  SELECT
    "id",
    CASE
      WHEN ("rank" > 1 OR "base" = 'workspace') AND count(*) OVER (PARTITION BY "candidate") > 1
        THEN trim(BOTH '-' FROM left("base", 31)) || '-' || substr(md5("id"), 1, 8)
      ELSE "candidate"
    END AS "slug"
  FROM "candidates"
)
UPDATE "Company" AS "company"
SET "slug" = "resolved"."slug"
FROM "resolved"
WHERE "company"."id" = "resolved"."id";

ALTER TABLE "Company" ALTER COLUMN "slug" SET DEFAULT ('ws-'::text || substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 16));
ALTER TABLE "Company" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- AddCheckConstraint
ALTER TABLE "Company" ADD CONSTRAINT "Company_slug_format"
  CHECK (char_length("slug") BETWEEN 1 AND 40 AND "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
