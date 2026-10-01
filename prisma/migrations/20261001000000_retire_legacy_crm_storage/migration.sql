-- Expand/backfill/reconcile/finalize must complete before this contraction.
-- Existing databases require scripts/migrate-records-local.ts --mode prepare-contract.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
DO $locks$
DECLARE workspace record;
BEGIN
  FOR workspace IN SELECT id FROM "Company" ORDER BY id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(workspace.id, 0));
  END LOOP;
END
$locks$;
LOCK TABLE "Contact", "Organization", "Deal", "Service", "Task", "CustomColumn", "CustomFieldValue", "ContactIdentifier", "ServiceDeal", "ServiceUser", "DealOrganization", "DealUser", "DealContact", "ContactUser", "OrganizationUser", "TaskUser", "TaskContact", "TaskOrganization", "TaskDeal", "TaskService", "ContactOrganization", "EntityTerminology" IN ACCESS EXCLUSIVE MODE;
LOCK TABLE "Company", "RecordSchemaState", "RecordOperation", "RecordMigrationCheckpoint", "Widget", "DataView", "P13n", "Routine", "Webhook", "RecordEventSubscription" IN SHARE ROW EXCLUSIVE MODE;
-- fingerprint:start
-- Immutable v8 fingerprint: every legacy source row, including identity and timestamps.
CREATE OR REPLACE FUNCTION crm_legacy_source_fingerprint(workspace_id text) RETURNS text
LANGUAGE plpgsql AS $fingerprint$
DECLARE source_table text; source_row record; result text := md5('crm-legacy-source-v8');
BEGIN
  FOR source_table IN SELECT unnest(ARRAY['Contact', 'Organization', 'Deal', 'Service', 'Task', 'CustomColumn', 'CustomFieldValue', 'ContactIdentifier', 'ServiceDeal', 'ServiceUser', 'DealOrganization', 'DealUser', 'DealContact', 'ContactUser', 'OrganizationUser', 'TaskUser', 'TaskContact', 'TaskOrganization', 'TaskDeal', 'TaskService', 'ContactOrganization', 'EntityTerminology']::text[]) LOOP
    result := md5(result || source_table);
    FOR source_row IN EXECUTE format('SELECT to_jsonb(source)::text AS value FROM %I source WHERE "companyId" = $1 ORDER BY id', source_table) USING workspace_id LOOP
      result := md5(result || source_row.value);
    END LOOP;
  END LOOP;
  SELECT md5(result || COALESCE("dealWeightingColumnId", '<missing>')) INTO result FROM "Company" WHERE id = workspace_id;
  RETURN result;
END
$fingerprint$;
-- fingerprint:end
DO $guard$
DECLARE workspace record; receipt record;
BEGIN
  FOR workspace IN SELECT company.id, state.revision, state."storageMode", state."activeOperationId" FROM "Company" company LEFT JOIN "RecordSchemaState" state ON state."companyId" = company.id LOOP
    SELECT "sourceHash", manifest INTO receipt FROM "RecordMigrationCheckpoint" WHERE "companyId" = workspace.id AND version = 8;
    IF workspace."storageMode" IS DISTINCT FROM 'generic' OR workspace."activeOperationId" IS NOT NULL OR receipt."sourceHash" IS NULL OR receipt."sourceHash" <> crm_legacy_source_fingerprint(workspace.id) OR receipt.manifest->>'storageMode' <> 'generic' OR workspace.revision < (receipt.manifest->>'recordRevision')::integer OR (receipt.manifest->>'origin' = 'upgraded' AND receipt.manifest->>'finalizationHash' IS DISTINCT FROM (SELECT "sourceHash" FROM "RecordMigrationCheckpoint" WHERE "companyId"=workspace.id AND version=7)) THEN
      RAISE EXCEPTION 'Legacy CRM contraction refused: run local preflight, reconciliation, finalization and prepare-contract for every workspace';
    END IF;
    IF EXISTS (SELECT 1 FROM "RecordOperation" WHERE "companyId" = workspace.id AND state IN ('pending', 'staging')) OR EXISTS (SELECT 1 FROM "Widget" WHERE "companyId" = workspace.id AND ((kind = 'chart' AND measure IS NULL) OR (kind = 'activityTimeline' AND "activityQuery" IS NULL))) OR EXISTS (SELECT 1 FROM "DataView" WHERE "companyId" = workspace.id AND "surfaceKey" IN ('contacts-card-store', 'organizations-card-store', 'deals-card-store', 'services-card-store', 'tasks-card-store')) OR EXISTS (SELECT 1 FROM "P13n" WHERE "companyId" = workspace.id AND "p13nId" IN ('contacts-card-store', 'organizations-card-store', 'deals-card-store',  'services-card-store', 'tasks-card-store', 'contact-detail', 'organization-detail', 'deal-detail', 'service-detail', 'task-detail')) OR EXISTS (SELECT 1 FROM "Routine" WHERE "companyId"=workspace.id AND EXISTS (SELECT 1 FROM unnest("triggerEvents") event WHERE event ~ '^(contact|organization|deal|service|task)\.(created|updated|deleted)$')) OR EXISTS (SELECT 1 FROM "Webhook" WHERE "companyId"=workspace.id AND EXISTS (SELECT 1 FROM unnest(events) event WHERE event ~ '^(contact|organization|deal|service|task)\.(created|updated|deleted)$')) THEN
      RAISE EXCEPTION 'Legacy CRM contraction refused: unresolved operations or presentation definitions remain';
    END IF;
  END LOOP;
END
$guard$;
ALTER TABLE "Company" DROP COLUMN "dealWeightingColumnId";
DROP TABLE "Contact", "Organization", "Deal", "Service", "Task", "CustomColumn", "CustomFieldValue", "ContactIdentifier", "ServiceDeal", "ServiceUser", "DealOrganization", "DealUser", "DealContact", "ContactUser", "OrganizationUser", "TaskUser", "TaskContact", "TaskOrganization", "TaskDeal", "TaskService", "ContactOrganization", "EntityTerminology";
ALTER TABLE "Widget" DROP COLUMN "entityType", DROP COLUMN "entityFilters", DROP COLUMN "dealFilters", DROP COLUMN "groupByType", DROP COLUMN "groupByCustomColumnId", DROP COLUMN "aggregationType", DROP COLUMN "timelineFilters";
DROP FUNCTION crm_legacy_source_fingerprint(text);
COMMIT;
