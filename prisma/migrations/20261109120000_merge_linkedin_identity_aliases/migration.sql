-- The message sync stored LinkedIn contacts by member id (ACoAA...) while imports, invitations
-- and profile links stored the public username, so one profile could hold two identities.
-- This merges each such pair into the username identity, keeping the member id as its
-- messagingId and both values as keys, and adds the canonical keys every LinkedIn identity
-- needs for lookups. A group is merged only when its identities share one canonical username,
-- hold at most one member id and link exactly the same records; anything else is left alone.
-- Running it again finds nothing to merge.

CREATE SCHEMA crm_upgrade;

CREATE FUNCTION crm_upgrade.linkedin_handle(raw text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  handle text;
  decoded text;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN NULL;
  END IF;
  handle := coalesce(substring(btrim(raw) FROM '(?i)linkedin\.com/in/([^/?#]+)'), btrim(raw));
  handle := regexp_replace(regexp_replace(handle, '^@', ''), '/+$', '');
  IF position('%' IN handle) > 0 THEN
    BEGIN
      SELECT convert_from(
        string_agg(
          CASE WHEN part[1] IS NOT NULL THEN decode(substr(part[1], 2), 'hex') ELSE convert_to(part[2], 'UTF8') END,
          ''::bytea ORDER BY position
        ),
        'UTF8'
      )
      INTO decoded
      FROM regexp_matches(handle, '(%[0-9A-Fa-f]{2})|([^%]+|%)', 'g') WITH ORDINALITY AS parts(part, position);
      handle := decoded;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  IF handle IS NULL OR handle !~ '^[^[:space:]/?#%]{1,160}$' THEN
    RETURN NULL;
  END IF;
  RETURN handle;
END;
$$;

CREATE FUNCTION crm_upgrade.linkedin_key(raw text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN handle IS NULL THEN NULL
    WHEN handle ~ '^AC[A-Za-z0-9_-]{20,}$' THEN handle
    ELSE lower(normalize(handle, NFC))
  END
  FROM (SELECT crm_upgrade.linkedin_handle(raw) AS handle) AS h
$$;

CREATE TEMP TABLE linkedin_identity AS
SELECT
  identity."companyId",
  identity.id,
  identity."createdAt",
  identity.value ~ '^AC[A-Za-z0-9_-]{20,}$' AS "isMember",
  CASE
    WHEN identity.value ~ '^AC[A-Za-z0-9_-]{20,}$' THEN crm_upgrade.linkedin_key(identity."profileUrl")
    ELSE crm_upgrade.linkedin_key(identity.value)
  END AS username,
  coalesce(
    CASE WHEN identity.value ~ '^AC[A-Za-z0-9_-]{20,}$' THEN identity.value END,
    CASE WHEN identity."messagingId" ~ '^AC[A-Za-z0-9_-]{20,}$' THEN identity."messagingId" END
  ) AS "memberId",
  coalesce(
    (
      SELECT string_agg(link."typeId" || ':' || link."recordId", ',' ORDER BY link."typeId", link."recordId")
      FROM "RecordIdentityLink" link
      WHERE link."companyId" = identity."companyId" AND link."identityId" = identity.id
    ),
    ''
  ) AS records
FROM "RecordIdentity" identity
WHERE identity."channelClass" = 'linkedin';

DELETE FROM linkedin_identity WHERE username ~ '^AC[A-Za-z0-9_-]{20,}$';

CREATE TEMP TABLE linkedin_merge AS
WITH groups AS (
  SELECT "companyId", username
  FROM linkedin_identity
  WHERE username IS NOT NULL
  GROUP BY "companyId", username
  HAVING count(*) > 1
    AND count(DISTINCT "memberId") <= 1
    AND count(DISTINCT records) = 1
    AND bool_or(NOT "isMember")
),
ranked AS (
  SELECT
    li.*,
    row_number() OVER (
      PARTITION BY li."companyId", li.username
      ORDER BY li."isMember", li."createdAt", li.id
    ) AS rank,
    max(li."memberId") OVER (PARTITION BY li."companyId", li.username) AS "groupMemberId"
  FROM linkedin_identity li
  JOIN groups g ON g."companyId" = li."companyId" AND g.username = li.username
)
SELECT
  merged."companyId",
  merged.id AS "mergedId",
  survivor.id AS "survivorId",
  survivor."groupMemberId" AS "memberId"
FROM ranked merged
JOIN ranked survivor
  ON survivor."companyId" = merged."companyId" AND survivor.username = merged.username AND survivor.rank = 1
WHERE merged.rank > 1;

UPDATE "RecordIdentity" survivor
SET
  "messagingId" = coalesce(survivor."messagingId", merge."memberId", merge."messagingId"),
  "displayName" = coalesce(survivor."displayName", merge."displayName"),
  "profileUrl" = coalesce(survivor."profileUrl", merge."profileUrl"),
  "updatedAt" = NOW()
FROM (
  SELECT
    m."companyId",
    m."survivorId",
    max(m."memberId") AS "memberId",
    (array_agg(merged."messagingId" ORDER BY merged."createdAt", merged.id) FILTER (WHERE merged."messagingId" IS NOT NULL))[1] AS "messagingId",
    (array_agg(merged."displayName" ORDER BY merged."createdAt", merged.id) FILTER (WHERE merged."displayName" IS NOT NULL))[1] AS "displayName",
    (array_agg(merged."profileUrl" ORDER BY merged."createdAt", merged.id) FILTER (WHERE merged."profileUrl" IS NOT NULL))[1] AS "profileUrl"
  FROM linkedin_merge m
  JOIN "RecordIdentity" merged ON merged."companyId" = m."companyId" AND merged.id = m."mergedId"
  GROUP BY m."companyId", m."survivorId"
) merge
WHERE survivor."companyId" = merge."companyId" AND survivor.id = merge."survivorId";

UPDATE "RecordIdentityKey" key
SET "identityId" = m."survivorId"
FROM linkedin_merge m
WHERE key."companyId" = m."companyId" AND key."channelClass" = 'linkedin' AND key."identityId" = m."mergedId";

DELETE FROM "RecordIdentity" identity
USING linkedin_merge m
WHERE identity."companyId" = m."companyId" AND identity.id = m."mergedId";

INSERT INTO "RecordIdentityKey" ("companyId", "channelClass", value, "identityId")
SELECT DISTINCT ON (identity."companyId", key.value)
  identity."companyId", 'linkedin', key.value, identity.id
FROM "RecordIdentity" identity
CROSS JOIN LATERAL (
  VALUES
    (crm_upgrade.linkedin_key(identity.value)),
    (crm_upgrade.linkedin_key(identity."messagingId")),
    (crm_upgrade.linkedin_key(identity."profileUrl"))
) AS key(value)
WHERE identity."channelClass" = 'linkedin' AND key.value IS NOT NULL
ORDER BY identity."companyId", key.value, identity."createdAt", identity.id
ON CONFLICT ("companyId", "channelClass", value) DO NOTHING;

DROP TABLE linkedin_merge;
DROP TABLE linkedin_identity;
DROP FUNCTION crm_upgrade.linkedin_key(text);
DROP FUNCTION crm_upgrade.linkedin_handle(text);
DROP SCHEMA crm_upgrade;
