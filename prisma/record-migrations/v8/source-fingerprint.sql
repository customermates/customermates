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
