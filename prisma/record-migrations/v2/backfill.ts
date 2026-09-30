import Decimal from "decimal.js";

import type { ClientBase } from "pg";
import type { LegacyModel } from "./legacy-model";
import type { MigrationValue } from "./value-storage";
import type { RecordScalar } from "./contract/record-model.schema";

import { LEGACY_TABLES, LEGACY_TYPES, LEGACY_RELATIONSHIPS, legacyFieldScalar } from "./legacy-model";
import { presetId } from "./contract/crm-preset";
import { writeMigrationValues } from "./value-storage";

export async function backfillLegacyRecords(client: ClientBase, source: LegacyModel, actorId: string): Promise<void> {
  const { companyId, model } = source;
  const id = (key: string) => presetId(companyId, key);
  for (const type of model.types) {
    const presetKey = [...LEGACY_TYPES, "lineItem"].find((key) => id(key) === type.id);
    await client.query(
      'INSERT INTO "RecordTypeDefinition" ("companyId", id, "presetKey", label, "pluralLabel", archived, embedded, position, definition, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())',
      [
        companyId,
        type.id,
        presetKey,
        type.label,
        type.pluralLabel,
        type.archived,
        type.embedded,
        type.position,
        JSON.stringify(type),
      ],
    );
  }
  for (const field of model.fields) {
    const legacy = source.columns.find((column) => column.id === field.id);
    await client.query(
      'INSERT INTO "RecordFieldDefinition" ("companyId", "typeId", id, "valueType", behavior, archived, definition, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()), COALESCE($9, NOW()))',
      [
        companyId,
        field.typeId,
        field.id,
        field.valueType,
        field.behavior.kind,
        field.archived,
        JSON.stringify(field),
        legacy?.createdAt,
        legacy?.updatedAt,
      ],
    );
  }
  for (const relation of model.relationships) {
    await client.query(
      'INSERT INTO "RecordRelationshipDefinition" ("companyId", id, "sourceTypeId", "targetTypeId", definition, archived, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())',
      [
        companyId,
        relation.id,
        relation.sourceTypeId,
        relation.targetTypeId,
        JSON.stringify(relation),
        relation.archived,
      ],
    );
  }

  await client.query(
    'INSERT INTO "RecordSchemaState" ("companyId", revision, "storageMode") VALUES ($1, 1, \'backfilled\')',
    [companyId],
  );
  await client.query(
    'INSERT INTO "RecordSchemaRevision" ("companyId", revision, "actorId", snapshot) VALUES ($1, 1, $2, $3)',
    [companyId, actorId, JSON.stringify(model)],
  );
  for (const type of LEGACY_TYPES) {
    const table = LEGACY_TABLES[type];
    await client.query(
      `INSERT INTO "CrmRecord" ("companyId", "typeId", id, "protectedKind", "systemData", "createdAt", "updatedAt") SELECT "companyId", $2, id, ${type === "task" ? "CASE WHEN type = 'userPendingAuthorization' THEN 'membershipAuthorization' END, jsonb_build_object('relatedUserId', \"relatedUserId\")" : "NULL, NULL"}, "createdAt", "updatedAt" FROM "${table}" WHERE "companyId" = $1`,
      [companyId, id(type)],
    );
    await client.query(
      `INSERT INTO "RecordAssignment" ("companyId", "typeId", "recordId", "userId", "createdAt") SELECT "companyId", $2, "${type}Id", "userId", "createdAt" FROM "${table}User" WHERE "companyId" = $1`,
      [companyId, id(type)],
    );
    await client.query(
      `INSERT INTO "RecordTypeGrant" ("companyId", "typeId", "roleId", actions) SELECT "companyId", $2, "roleId", array_agg(action) FROM "RolePermission" WHERE "companyId" = $1 AND resource::text = $3 GROUP BY "companyId", "roleId"`,
      [companyId, id(type), `${type}s`],
    );
    let afterId = "";
    for (;;) {
      const page = await client.query(
        `SELECT *, ${type === "service" ? 'amount::text AS "sourceAmount"' : 'NULL AS "sourceAmount"'} FROM "${table}" WHERE "companyId" = $1 AND id > $2 ORDER BY id LIMIT 500`,
        [companyId, afterId],
      );
      if (!page.rows.length) break;
      const values: MigrationValue[] = [];
      for (const row of page.rows) {
        const add = (key: string, scalar: RecordScalar | null) =>
          values.push({
            typeId: id(type),
            recordId: row.id,
            fieldId: id(`${type}.${key}`),
            result: scalar === null ? { state: "missing" } : { state: "value", value: scalar },
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          });
        if (type === "contact") {
          add("firstName", { kind: "text", value: row.firstName });
          add("lastName", { kind: "text", value: row.lastName });
          add("avatarUrl", row.avatarUrl === null ? null : { kind: "text", value: row.avatarUrl });
        } else add("name", { kind: "text", value: row.name });
        add("notes", row.notes === null ? null : { kind: "richText", documentJson: JSON.stringify(row.notes) });
        if (type === "service") {
          add("amount", {
            kind: "decimal",
            value: new Decimal(row.sourceAmount).toFixed(),
            currency: source.currency,
          });
        }
      }
      await writeMigrationValues(client, companyId, values);
      afterId = page.rows[page.rows.length - 1].id;
    }
  }
  await client.query(
    'INSERT INTO "CrmRecord" ("companyId", "typeId", id, "createdAt", "updatedAt") SELECT "companyId", $2, id, "createdAt", "updatedAt" FROM "ServiceDeal" WHERE "companyId" = $1',
    [companyId, id("lineItem")],
  );
  for (const relation of LEGACY_RELATIONSHIPS) {
    await client.query(
      `INSERT INTO "RecordLink" ("companyId", id, "relationId", "sourceTypeId", "sourceId", "targetTypeId", "targetId", "createdAt", "updatedAt") SELECT "companyId", id, $2, $3, "${relation.source}Id", $4, "${relation.target}Id", "createdAt", "updatedAt" FROM "${relation.table}" WHERE "companyId" = $1`,
      [companyId, id(relation.key), id(relation.source), id(relation.target)],
    );
  }

  for (const type of ["service", "deal"]) {
    await client.query(
      `INSERT INTO "RecordLink" ("companyId", id, "relationId", "sourceTypeId", "sourceId", "targetTypeId", "targetId", "createdAt", "updatedAt") SELECT "companyId", id, $2, $3, id, $4, "${type}Id", "createdAt", "updatedAt" FROM "ServiceDeal" WHERE "companyId" = $1`,
      [companyId, id(`lineItem.${type}`), id("lineItem"), id(type)],
    );
  }

  let afterId = "";
  for (;;) {
    const page = await client.query(
      'SELECT id, quantity::text AS quantity, "createdAt", "updatedAt" FROM "ServiceDeal" WHERE "companyId" = $1 AND id > $2 ORDER BY id LIMIT 500',
      [companyId, afterId],
    );
    if (!page.rows.length) break;
    const values: MigrationValue[] = [];
    for (const row of page.rows) {
      for (const [key, scalar] of [
        ["name", { kind: "text", value: "Line item" }],
        [
          "quantity",
          {
            kind: "decimal",
            value: new Decimal(row.quantity).toFixed(),
            currency: null,
          },
        ],
        ["pricingMode", { kind: "select", value: "live" }],
      ] as const) {
        values.push({
          typeId: id("lineItem"),
          recordId: row.id,
          fieldId: id(`lineItem.${key}`),
          result: { state: "value", value: scalar },
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        });
      }
    }
    await writeMigrationValues(client, companyId, values);
    afterId = page.rows[page.rows.length - 1].id;
  }
  const fieldMap = new Map(model.fields.map((field) => [field.id, field]));
  afterId = "";
  for (;;) {
    const page = await client.query(
      'SELECT * FROM "CustomFieldValue" WHERE "companyId" = $1 AND id > $2 ORDER BY id LIMIT 500',
      [companyId, afterId],
    );
    if (!page.rows.length) break;
    const values: MigrationValue[] = [];
    for (const row of page.rows) {
      const field = fieldMap.get(row.columnId);
      if (!field) throw new Error("Preflight must resolve every field before backfill");
      const scalar = legacyFieldScalar(row.value, field, source.currency);
      values.push({
        typeId: field.typeId,
        recordId: row[`${row.entityType}Id`],
        fieldId: field.id,
        result: scalar === null ? { state: "missing" } : { state: "value", value: scalar },
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    }
    await writeMigrationValues(client, companyId, values);
    afterId = page.rows[page.rows.length - 1].id;
  }
}
