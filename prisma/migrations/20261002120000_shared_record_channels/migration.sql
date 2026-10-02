BEGIN;
DO $guard$
DECLARE workspace record;
BEGIN
  FOR workspace IN SELECT id FROM "Company" ORDER BY id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(workspace.id, 0));
  END LOOP;
  IF EXISTS (SELECT 1 FROM "RecordSchemaState" WHERE "activeOperationId" IS NOT NULL)
    OR EXISTS (SELECT 1 FROM "RecordOperation" WHERE state IN ('pending', 'staging')) THEN
    RAISE EXCEPTION 'Shared channel migration refused: complete or cancel active CRM operations first';
  END IF;
END
$guard$;
CREATE TABLE "RecordIdentityLink" (
  "companyId" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  "typeId" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecordIdentityLink_pkey" PRIMARY KEY ("companyId", "identityId", "typeId", "recordId"),
  CONSTRAINT "RecordIdentityLink_companyId_identityId_fkey" FOREIGN KEY ("companyId", "identityId") REFERENCES "RecordIdentity"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecordIdentityLink_companyId_typeId_recordId_fkey" FOREIGN KEY ("companyId", "typeId", "recordId") REFERENCES "CrmRecord"("companyId", "typeId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RecordIdentityLink_companyId_typeId_recordId_idx" ON "RecordIdentityLink"("companyId", "typeId", "recordId");
INSERT INTO "RecordIdentityLink" ("companyId", "identityId", "typeId", "recordId", "createdAt")
SELECT "companyId", id, "typeId", "recordId", "createdAt" FROM "RecordIdentity";
ALTER TABLE "RecordIdentity" DROP CONSTRAINT "RecordIdentity_companyId_typeId_recordId_fkey";
DROP INDEX "RecordIdentity_companyId_typeId_recordId_idx";
ALTER TABLE "RecordIdentity" DROP COLUMN "typeId", DROP COLUMN "recordId";
CREATE UNIQUE INDEX "MessagingThread_companyId_id_key" ON "MessagingThread"("companyId", id);
CREATE TABLE "MessagingThreadRecordLink" (
  "companyId" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "typeId" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessagingThreadRecordLink_pkey" PRIMARY KEY ("companyId", "threadId", "typeId", "recordId"),
  CONSTRAINT "MessagingThreadRecordLink_companyId_threadId_fkey" FOREIGN KEY ("companyId", "threadId") REFERENCES "MessagingThread"("companyId", id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MessagingThreadRecordLink_companyId_typeId_recordId_fkey" FOREIGN KEY ("companyId", "typeId", "recordId") REFERENCES "CrmRecord"("companyId", "typeId", id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MessagingThreadRecordLink_companyId_typeId_recordId_threadI_idx" ON "MessagingThreadRecordLink"("companyId", "typeId", "recordId", "threadId");
WITH updated AS (
  SELECT state."companyId", state.revision + 1 AS revision,
    jsonb_set(jsonb_set(revision.snapshot, '{capabilities}',
      (SELECT COALESCE(jsonb_agg(CASE WHEN binding->>'kind' = 'personIdentity' THEN binding || '{"kind":"channels","enabled":true,"providerAvatar":true}'::jsonb ELSE binding END ORDER BY ordinal), '[]'::jsonb)
       FROM jsonb_array_elements(COALESCE(revision.snapshot->'capabilities', '[]'::jsonb)) WITH ORDINALITY AS capability(binding, ordinal))),
       '{revision}', to_jsonb(state.revision + 1)) AS snapshot
  FROM "RecordSchemaState" state JOIN "RecordSchemaRevision" revision ON revision."companyId" = state."companyId" AND revision.revision = state.revision
  WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(revision.snapshot->'capabilities', '[]'::jsonb)) binding WHERE binding->>'kind' = 'personIdentity')
), inserted AS (
  INSERT INTO "RecordSchemaRevision" ("companyId", revision, "actorId", snapshot, "createdAt")
  SELECT "companyId", revision, 'system:shared-channel-migration', snapshot, CURRENT_TIMESTAMP FROM updated
  RETURNING "companyId", revision
)
UPDATE "RecordSchemaState" state SET revision = inserted.revision FROM inserted WHERE state."companyId" = inserted."companyId";
COMMIT;
