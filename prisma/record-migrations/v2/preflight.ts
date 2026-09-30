import Decimal from "decimal.js";

import type { ClientBase } from "pg";
import type { LegacyModel, MigrationIssue } from "./legacy-model";

import { legacyFieldScalar, LEGACY_RELATIONSHIPS, LEGACY_TABLES, LEGACY_TYPES, LegacyValueError } from "./legacy-model";
import { isRepresentableDecimal } from "./contract/calculation";
import { preflightLegacyIdentities } from "./identity";

export type LegacyPreflight = {
  version: 2;
  companyId: string;
  counts: Record<string, number>;
  issues: MigrationIssue[];
};
export async function preflightLegacyRecords(client: ClientBase, source: LegacyModel): Promise<LegacyPreflight> {
  const report: LegacyPreflight = {
    version: 2,
    companyId: source.companyId,
    counts: {},
    issues: [...source.issues],
  };
  const issue = (table: string, id: string, field: string, code: string) =>
    report.issues.push({ table, id, field, code });
  for (const type of LEGACY_TYPES) {
    const table = LEGACY_TABLES[type];
    report.counts[type] = Number(
      (await client.query(`SELECT COUNT(*) AS count FROM "${table}" WHERE "companyId" = $1`, [source.companyId]))
        .rows[0].count,
    );
  }
  for (const [table, field] of [
    ["Service", "amount"],
    ["ServiceDeal", "quantity"],
  ]) {
    let afterId = "";
    for (;;) {
      const page = await client.query(
        `SELECT id, "${field}"::text AS value FROM "${table}" WHERE "companyId" = $1 AND id > $2 ORDER BY id LIMIT 500`,
        [source.companyId, afterId],
      );
      for (const row of page.rows) {
        try {
          if (!isRepresentableDecimal(new Decimal(row.value).toFixed()))
            issue(table, row.id, field, "unrepresentable_decimal");
        } catch {
          issue(table, row.id, field, "invalid_decimal");
        }
      }
      if (!page.rows.length) break;
      afterId = page.rows[page.rows.length - 1].id;
    }
  }
  for (const relation of [
    ...LEGACY_RELATIONSHIPS,
    { table: "ServiceDeal", source: "service", target: "deal" } as const,
  ]) {
    const rows = await client.query(
      `SELECT link.id FROM "${relation.table}" link LEFT JOIN "${LEGACY_TABLES[relation.source]}" source ON source.id = link."${relation.source}Id" AND source."companyId" = $1 LEFT JOIN "${LEGACY_TABLES[relation.target]}" target ON target.id = link."${relation.target}Id" AND target."companyId" = $1 WHERE link."companyId" = $1 AND (source.id IS NULL OR target.id IS NULL)`,
      [source.companyId],
    );
    for (const row of rows.rows) issue(relation.table, row.id, "endpoints", "cross_workspace_reference");
    report.counts[relation.table === "ServiceDeal" ? "lineItem" : relation.table] = Number(
      (
        await client.query(`SELECT COUNT(*) AS count FROM "${relation.table}" WHERE "companyId" = $1`, [
          source.companyId,
        ])
      ).rows[0].count,
    );
  }
  for (const type of LEGACY_TYPES) {
    const table = `${LEGACY_TABLES[type]}User`;
    const rows = await client.query(
      `SELECT link.id FROM "${table}" link LEFT JOIN "${LEGACY_TABLES[type]}" record ON record.id = link."${type}Id" AND record."companyId" = $1 LEFT JOIN "User" member ON member.id = link."userId" AND member."companyId" = $1 WHERE link."companyId" = $1 AND (record.id IS NULL OR member.id IS NULL)`,
      [source.companyId],
    );
    for (const row of rows.rows) issue(table, row.id, "endpoints", "cross_workspace_reference");
    report.counts[table] = Number(
      (await client.query(`SELECT COUNT(*) AS count FROM "${table}" WHERE "companyId" = $1`, [source.companyId]))
        .rows[0].count,
    );
  }
  const fieldMap = new Map(source.model.fields.map((field) => [field.id, field]));
  const columns = new Map(source.columns.map((column) => [column.id, column]));
  let afterId = "";
  report.counts.fieldValues = 0;
  const endpointsSql = LEGACY_TYPES.map(
    (type) =>
      `WHEN field."entityType"::text = '${type}' THEN EXISTS (SELECT 1 FROM "${LEGACY_TABLES[type]}" record WHERE record."companyId" = $1 AND record.id = field."${type}Id")`,
  ).join(" ");
  for (;;) {
    const page = await client.query(
      `SELECT field.*, CASE ${endpointsSql} ELSE false END AS "validEndpoint" FROM "CustomFieldValue" field WHERE "companyId" = $1 AND id > $2 ORDER BY id LIMIT 500`,
      [source.companyId, afterId],
    );
    if (!page.rows.length) break;
    for (const row of page.rows) {
      report.counts.fieldValues++;
      const field = fieldMap.get(row.columnId);
      const column = columns.get(row.columnId);
      if (!field || !column || column.type !== row.type || column.entityType !== row.entityType) {
        issue("CustomFieldValue", row.id, "columnId", "field_definition_mismatch");
        continue;
      }
      const endpoints = LEGACY_TYPES.filter((type) => row[`${type}Id`] !== null);
      if (endpoints.length !== 1 || endpoints[0] !== row.entityType)
        issue("CustomFieldValue", row.id, "record", "invalid_record_reference");
      if (!row.validEndpoint) issue("CustomFieldValue", row.id, "record", "cross_workspace_reference");
      try {
        legacyFieldScalar(row.value, field, source.currency);
      } catch (error) {
        issue("CustomFieldValue", row.id, "value", error instanceof LegacyValueError ? error.code : "invalid_value");
      }
    }
    afterId = page.rows[page.rows.length - 1].id;
  }
  const duplicates = await client.query(
    'SELECT "columnId", COALESCE("contactId", "organizationId", "dealId", "serviceId", "taskId") AS id FROM "CustomFieldValue" WHERE "companyId" = $1 GROUP BY "columnId", COALESCE("contactId", "organizationId", "dealId", "serviceId", "taskId") HAVING COUNT(*) > 1',
    [source.companyId],
  );
  for (const row of duplicates.rows)
    issue("CustomFieldValue", row.id ?? "unknown", row.columnId, "duplicate_field_value");
  const invalidTasks = await client.query(
    'SELECT task.id FROM "Task" task LEFT JOIN "User" member ON member.id = task."relatedUserId" AND member."companyId" = $1 WHERE task."companyId" = $1 AND task.type = \'userPendingAuthorization\' AND member.id IS NULL',
    [source.companyId],
  );
  for (const row of invalidTasks.rows) issue("Task", row.id, "relatedUserId", "invalid_protected_task_owner");
  const identities = await preflightLegacyIdentities(client, source.companyId);
  report.counts.identities = identities.count;
  report.issues.push(...identities.issues);
  return report;
}
