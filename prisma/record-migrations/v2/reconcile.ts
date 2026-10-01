import { isDeepStrictEqual } from "node:util";

import type { ClientBase } from "pg";
import type { LegacyModel, MigrationIssue } from "./legacy-model";

import { LEGACY_TYPES, LEGACY_TABLES, LEGACY_RELATIONSHIPS, legacyFieldScalar } from "./legacy-model";
import { presetId } from "./contract/crm-preset";
import { readMigrationValue } from "./value-storage";
import { reconcileLegacyIdentities } from "./identity";

export type ReconciliationReport = {
  version: 2;
  companyId: string;
  valid: boolean;
  checkedRecords: number;
  checkedValues: number;
  checkedLinks: number;
  issues: MigrationIssue[];
  legacyCacheDifferences: number;
};
export async function reconcileMigratedRecords(client: ClientBase, source: LegacyModel): Promise<ReconciliationReport> {
  const report: ReconciliationReport = {
    version: 2,
    companyId: source.companyId,
    valid: true,
    checkedRecords: 0,
    checkedValues: 0,
    checkedLinks: 0,
    issues: [],
    legacyCacheDifferences: 0,
  };
  const id = (key: string) => presetId(source.companyId, key);
  const issue = (table: string, rowId: string, field: string, code = "reconciliation_mismatch") =>
    report.issues.push({ table, id: rowId, field, code });
  for (const type of [...LEGACY_TYPES, "lineItem"] as const) {
    const table = type === "lineItem" ? "ServiceDeal" : LEGACY_TABLES[type];
    const result = await client.query(
      `SELECT COALESCE(legacy.id, record.id) AS id FROM (SELECT * FROM "${table}" WHERE "companyId" = $1) legacy FULL JOIN (SELECT * FROM "CrmRecord" WHERE "companyId" = $1 AND "typeId" = $2) record ON legacy.id = record.id WHERE legacy.id IS NULL OR record.id IS NULL OR legacy."createdAt" <> record."createdAt" OR legacy."updatedAt" <> record."updatedAt"`,
      [source.companyId, id(type)],
    );
    for (const row of result.rows) issue(table, row.id, "identity_or_timestamps");
    const system = await client.query(
      `SELECT legacy.id FROM "${table}" legacy LEFT JOIN "CrmRecord" record ON record."companyId" = $1 AND record."typeId" = $2 AND record.id = legacy.id WHERE legacy."companyId" = $1 AND (${type === "task" ? "CASE WHEN legacy.type = 'userPendingAuthorization' THEN 'membershipAuthorization' END IS DISTINCT FROM record.\"protectedKind\" OR jsonb_build_object('relatedUserId', legacy.\"relatedUserId\") IS DISTINCT FROM record.\"systemData\"" : 'record."protectedKind" IS NOT NULL OR record."systemData" IS NOT NULL'})`,
      [source.companyId, id(type)],
    );
    for (const row of system.rows) issue(table, row.id, "protected_state");
    report.checkedRecords += Number(
      (await client.query(`SELECT COUNT(*) FROM "${table}" WHERE "companyId" = $1`, [source.companyId])).rows[0].count,
    );
    if (type !== "lineItem") {
      const assignment = await client.query(
        `SELECT COALESCE(legacy."${type}Id", record."recordId") AS id FROM (SELECT * FROM "${table}User" WHERE "companyId" = $1) legacy FULL JOIN (SELECT * FROM "RecordAssignment" WHERE "companyId" = $1 AND "typeId" = $2) record ON legacy."${type}Id" = record."recordId" AND legacy."userId" = record."userId" WHERE legacy.id IS NULL OR record."recordId" IS NULL OR legacy."createdAt" <> record."createdAt"`,
        [source.companyId, id(type)],
      );
      for (const row of assignment.rows) issue(`${table}User`, row.id, "assignment");
      const builtins =
        type === "contact"
          ? [
              ["firstName", 'legacy."firstName"'],
              ["lastName", 'legacy."lastName"'],
              ["avatarUrl", 'legacy."avatarUrl"'],
            ]
          : [["name", "legacy.name"]];
      for (const [key, expression] of builtins) {
        const values = await client.query(
          `SELECT legacy.id FROM "${table}" legacy LEFT JOIN "RecordValue" value ON value."companyId" = $1 AND value."typeId" = $2 AND value."recordId" = legacy.id AND value."fieldId" = $3 WHERE legacy."companyId" = $1 AND (${expression} IS DISTINCT FROM value."textValue" OR value."recordId" IS NULL)`,
          [source.companyId, id(type), id(`${type}.${key}`)],
        );
        for (const row of values.rows) issue(table, row.id, key);
      }
      const notes = await client.query(
        `SELECT legacy.id FROM "${table}" legacy LEFT JOIN "RecordValue" value ON value."companyId" = $1 AND value."typeId" = $2 AND value."recordId" = legacy.id AND value."fieldId" = $3 WHERE legacy."companyId" = $1 AND (NULLIF(legacy.notes, 'null'::jsonb) IS DISTINCT FROM value."jsonValue" OR value."recordId" IS NULL)`,
        [source.companyId, id(type), id(`${type}.notes`)],
      );
      for (const row of notes.rows) issue(table, row.id, "notes");
    }
  }
  for (const [table, type, key, expression, currency] of [
    ["Service", "service", "amount", "legacy.amount::text::numeric", source.currency],
    ["ServiceDeal", "lineItem", "quantity", "legacy.quantity::text::numeric", null],
    ["ServiceDeal", "lineItem", "effectivePrice", "service.amount::text::numeric", source.currency],
    [
      "ServiceDeal",
      "lineItem",
      "amount",
      "legacy.quantity::text::numeric * service.amount::text::numeric",
      source.currency,
    ],
  ] as const) {
    const values = await client.query(
      `SELECT legacy.id FROM "${table}" legacy ${table === "ServiceDeal" ? 'JOIN "Service" service ON service."companyId" = legacy."companyId" AND service.id = legacy."serviceId"' : ""} LEFT JOIN "RecordValue" value ON value."companyId" = $1 AND value."typeId" = $2 AND value."recordId" = legacy.id AND value."fieldId" = $3 WHERE legacy."companyId" = $1 AND (${expression} IS DISTINCT FROM value."decimalValue" OR value.state IS DISTINCT FROM 'value' OR value.currency IS DISTINCT FROM $4::text)`,
      [source.companyId, id(type), id(`${type}.${key}`), currency],
    );
    for (const row of values.rows) issue(table, row.id, key);
    report.checkedValues += Number(
      (await client.query(`SELECT COUNT(*) FROM "${table}" WHERE "companyId" = $1`, [source.companyId])).rows[0].count,
    );
  }
  const pricingModes = await client.query(
    'SELECT legacy.id FROM "ServiceDeal" legacy LEFT JOIN "RecordValue" value ON value."companyId" = $1 AND value."typeId" = $2 AND value."recordId" = legacy.id AND value."fieldId" = $3 WHERE legacy."companyId" = $1 AND (value.state IS DISTINCT FROM \'value\' OR value."textValue" IS DISTINCT FROM \'live\')',
    [source.companyId, id("lineItem"), id("lineItem.pricingMode")],
  );
  for (const row of pricingModes.rows) issue("ServiceDeal", row.id, "pricingMode");
  for (const relation of [
    ...LEGACY_RELATIONSHIPS.map((relation) => ({
      ...relation,
      sourceColumn: `${relation.source}Id`,
      targetColumn: `${relation.target}Id`,
    })),
    ...["service", "deal"].map((type) => ({
      table: "ServiceDeal",
      key: `lineItem.${type}`,
      source: "lineItem",
      target: type,
      sourceColumn: "id",
      targetColumn: `${type}Id`,
    })),
  ]) {
    const result = await client.query(
      `SELECT COALESCE(legacy.id, link.id) AS id FROM (SELECT * FROM "${relation.table}" WHERE "companyId" = $1) legacy FULL JOIN (SELECT * FROM "RecordLink" WHERE "companyId" = $1 AND "relationId" = $2) link ON legacy.id = link.id WHERE legacy.id IS NULL OR link.id IS NULL OR legacy."${relation.sourceColumn}" <> link."sourceId" OR legacy."${relation.targetColumn}" <> link."targetId" OR legacy."createdAt" <> link."createdAt" OR legacy."updatedAt" <> link."updatedAt"`,
      [source.companyId, id(relation.key)],
    );
    for (const row of result.rows) issue(relation.table, row.id, relation.key);
    report.checkedLinks += Number(
      (
        await client.query('SELECT COUNT(*) FROM "RecordLink" WHERE "companyId" = $1 AND "relationId" = $2', [
          source.companyId,
          id(relation.key),
        ])
      ).rows[0].count,
    );
  }
  const fieldMap = new Map(source.model.fields.map((field) => [field.id, field]));
  let afterId = "";
  for (;;) {
    const page = await client.query(
      'SELECT legacy.*, (to_jsonb(value.*) || jsonb_build_object(\'decimalValue\', value."decimalValue"::text)) AS migrated FROM "CustomFieldValue" legacy LEFT JOIN "RecordValue" value ON value."companyId" = $1 AND value."recordId" = COALESCE(legacy."contactId", legacy."organizationId", legacy."dealId", legacy."serviceId", legacy."taskId") AND value."fieldId" = legacy."columnId" WHERE legacy."companyId" = $1 AND legacy.id > $2 ORDER BY legacy.id LIMIT 500',
      [source.companyId, afterId],
    );
    if (!page.rows.length) break;
    for (const row of page.rows) {
      const field = fieldMap.get(row.columnId);
      if (!field) {
        issue("CustomFieldValue", row.id, "field");
        continue;
      }
      const scalar = legacyFieldScalar(row.value, field, source.currency);
      const expected = scalar === null ? { state: "missing" } : { state: "value", value: scalar };
      const actual = readMigrationValue(row.migrated ?? undefined, field);
      if (!row.migrated || !isDeepStrictEqual(actual, expected)) issue("CustomFieldValue", row.id, "value");
      report.checkedValues++;
    }
    afterId = page.rows[page.rows.length - 1].id;
  }
  const values = await client.query(
    `WITH totals AS (SELECT deal.id, COALESCE(SUM(service.amount::text::numeric * line.quantity::text::numeric), 0) AS value, COALESCE(SUM(line.quantity::text::numeric), 0) AS quantity, deal."totalValue"::text::numeric AS cached FROM "Deal" deal LEFT JOIN "ServiceDeal" line ON line."companyId" = $1 AND line."dealId" = deal.id LEFT JOIN "Service" service ON service."companyId" = $1 AND service.id = line."serviceId" WHERE deal."companyId" = $1 GROUP BY deal.id), expected AS (SELECT totals.*, totals.value * (option.value->>'weight')::numeric / 100 AS weighted FROM totals LEFT JOIN "CustomFieldValue" stage ON stage."companyId" = $1 AND stage."dealId" = totals.id AND stage."columnId" = $5 LEFT JOIN "CustomColumn" field ON field."companyId" = $1 AND field.id = $5 LEFT JOIN LATERAL jsonb_array_elements(field.options->'options') option(value) ON option.value->>'value' = stage.value)
    SELECT expected.id, expected.value IS DISTINCT FROM value."decimalValue" AS "valueMismatch", expected.quantity IS DISTINCT FROM quantity."decimalValue" AS "quantityMismatch", expected.weighted IS DISTINCT FROM weighted."decimalValue" AS "weightMismatch", expected.value IS DISTINCT FROM expected.cached AS "cacheMismatch" FROM expected LEFT JOIN "RecordValue" value ON value."companyId" = $1 AND value."recordId" = expected.id AND value."fieldId" = $2 LEFT JOIN "RecordValue" quantity ON quantity."companyId" = $1 AND quantity."recordId" = expected.id AND quantity."fieldId" = $3 LEFT JOIN "RecordValue" weighted ON weighted."companyId" = $1 AND weighted."recordId" = expected.id AND weighted."fieldId" = $4`,
    [
      source.companyId,
      id("deal.totalValue"),
      id("deal.totalQuantity"),
      id("deal.weightedValue"),
      source.weightingFieldId,
    ],
  );
  for (const row of values.rows) {
    if (row.valueMismatch) issue("Deal", row.id, "totalValue");
    if (row.quantityMismatch) issue("Deal", row.id, "totalQuantity");
    if (row.weightMismatch) issue("Deal", row.id, "weightedValue");
    if (row.cacheMismatch) report.legacyCacheDifferences++;
  }
  report.issues.push(...(await reconcileLegacyIdentities(client, source.companyId)));
  report.valid = report.issues.length === 0;
  return report;
}
