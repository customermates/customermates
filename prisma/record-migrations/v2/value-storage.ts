import Decimal from "decimal.js";

import type { ClientBase } from "pg";
import type { CalculatedValue, RecordField } from "./contract/record-model.schema";

export type MigrationValue = {
  typeId: string;
  recordId: string;
  fieldId: string;
  result: CalculatedValue;
  createdAt: Date;
  updatedAt: Date;
};
export async function writeMigrationValues(
  client: ClientBase,
  companyId: string,
  values: MigrationValue[],
): Promise<void> {
  if (!values.length) return;
  await client.query(
    `INSERT INTO "RecordValue" ("companyId", "typeId", "recordId", "fieldId", state, "textValue", "textListValue", "decimalValue", currency, "booleanValue", "instantValue", "lexicalValue", "jsonValue", "errorCode", "schemaRevision", "createdAt", "updatedAt", "rangeStart", "rangeEnd")
    SELECT $1, row->>'typeId', row->>'recordId', row->>'fieldId', row->'result'->>'state',
      CASE WHEN row->'result'->'value'->>'kind' IN ('text', 'select', 'member') THEN row->'result'->'value'->>'value' END,
      CASE WHEN row->'result'->'value'->>'kind' = 'textList' THEN ARRAY(SELECT jsonb_array_elements_text(row->'result'->'value'->'value')) ELSE ARRAY[]::text[] END,
      CASE WHEN row->'result'->'value'->>'kind' = 'decimal' THEN (row->'result'->'value'->>'value')::numeric END,
      row->'result'->'value'->>'currency',
      CASE WHEN row->'result'->'value'->>'kind' = 'boolean' THEN (row->'result'->'value'->>'value')::boolean END,
      CASE WHEN row->'result'->'value'->>'kind' IN ('date', 'dateTime') THEN (row->'result'->'value'->>'value')::timestamptz AT TIME ZONE 'UTC' END,
      CASE WHEN row->'result'->'value'->>'kind' IN ('date', 'dateTime') THEN row->'result'->'value'->>'value' END,
      CASE WHEN row->'result'->'value'->>'kind' = 'richText' THEN (row->'result'->'value'->>'documentJson')::jsonb WHEN row->'result'->'value'->>'kind' = 'range' THEN (row->'result'->'value') - 'kind' END,
      row->'result'->>'code', 1, (row->>'createdAt')::timestamptz AT TIME ZONE 'UTC', (row->>'updatedAt')::timestamptz AT TIME ZONE 'UTC',
      CASE WHEN row->'result'->'value'->>'kind' = 'range' THEN (row->'result'->'value'->>'start')::timestamptz AT TIME ZONE 'UTC' END,
      CASE WHEN row->'result'->'value'->>'kind' = 'range' THEN (row->'result'->'value'->>'end')::timestamptz AT TIME ZONE 'UTC' END
    FROM jsonb_array_elements($2::jsonb) row
    ON CONFLICT ("companyId", "typeId", "recordId", "fieldId") DO UPDATE SET state = EXCLUDED.state, "textValue" = EXCLUDED."textValue", "textListValue" = EXCLUDED."textListValue", "decimalValue" = EXCLUDED."decimalValue", currency = EXCLUDED.currency, "booleanValue" = EXCLUDED."booleanValue", "instantValue" = EXCLUDED."instantValue", "lexicalValue" = EXCLUDED."lexicalValue", "jsonValue" = EXCLUDED."jsonValue", "errorCode" = EXCLUDED."errorCode", "updatedAt" = EXCLUDED."updatedAt", "rangeStart" = EXCLUDED."rangeStart", "rangeEnd" = EXCLUDED."rangeEnd"`,
    [companyId, JSON.stringify(values)],
  );
}

export function readMigrationValue(row: Record<string, unknown> | undefined, field: RecordField): CalculatedValue {
  if (!row || row.state === "missing") return { state: "missing" };
  if (row.state === "error") {
    return {
      state: "error",
      code: row.errorCode as Extract<CalculatedValue, { state: "error" }>["code"],
    };
  }
  if (field.multiple) {
    return {
      state: "value",
      value: { kind: "textList", value: row.textListValue as string[] },
    };
  }
  if (field.valueType === "currency" || field.valueType === "number") {
    return {
      state: "value",
      value: {
        kind: "decimal",
        value: new Decimal(String(row.decimalValue)).toFixed(),
        currency: row.currency as string | null,
      },
    };
  }
  if (field.valueType === "boolean") {
    return {
      state: "value",
      value: { kind: "boolean", value: row.booleanValue as boolean },
    };
  }
  if (field.valueType === "date" || field.valueType === "dateTime") {
    return {
      state: "value",
      value: { kind: field.valueType, value: row.lexicalValue as string },
    };
  }
  if (field.valueType === "dateRange" || field.valueType === "dateTimeRange") {
    return {
      state: "value",
      value: {
        kind: "range",
        ...(row.jsonValue as { start: string | null; end: string | null }),
      },
    };
  }
  if (field.valueType === "richText") {
    return {
      state: "value",
      value: { kind: "richText", documentJson: JSON.stringify(row.jsonValue) },
    };
  }
  return {
    state: "value",
    value: {
      kind: field.valueType === "select" ? "select" : field.valueType === "member" ? "member" : "text",
      value: row.textValue as string,
    },
  };
}
