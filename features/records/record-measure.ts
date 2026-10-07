import { Prisma } from "@/generated/prisma";

import type { RecordModel, RecordField } from "./record-model.schema";
import type { RecordMeasure } from "./record-measure.schema";
import type { RecordAccessMap } from "./record-query.schema";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordWriteError } from "./record-write.service";
import { compileRecordQuery, fieldReadPredicate } from "./record-query";
import { RecordQuerySchema } from "./record-query.schema";
import { recordPathJoins } from "./record-path-query";
import { hasRecordMeasureGroupFilter } from "./record-measure.schema";

export type MeasureRow = {
  groupRecordId: string | null;
  groupTypeId: string | null;
  groupFieldId: string | null;
  groupState: string;
  groupValue: Prisma.JsonValue;
  resultState: string;
  resultValue: string | null;
  resultCurrency: string | null;
  count: number;
};

function scalarJson(field: RecordField, value: Prisma.Sql): Prisma.Sql {
  if (field.multiple)
    return Prisma.sql`jsonb_build_object('kind', 'textList', 'value', to_jsonb(${value}."textListValue"))`;
  if (field.valueType === "currency" || field.valueType === "number")
    return Prisma.sql`jsonb_build_object('kind', 'decimal', 'value', ${value}."decimalValue"::text, 'currency', ${value}.currency)`;
  if (field.valueType === "boolean")
    return Prisma.sql`jsonb_build_object('kind', 'boolean', 'value', ${value}."booleanValue")`;
  if (field.valueType === "date")
    return Prisma.sql`jsonb_build_object('kind', 'date', 'value', to_char(${value}."instantValue", 'YYYY-MM-DD'))`;
  if (field.valueType === "dateTime")
    return Prisma.sql`jsonb_build_object('kind', 'dateTime', 'value', to_char(${value}."instantValue", 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))`;
  if (["richText", "dateRange", "dateTimeRange"].includes(field.valueType))
    throw new RecordWriteError(CustomErrorCode.recordValueInvalid);
  return Prisma.sql`jsonb_build_object('kind', ${field.valueType === "select" || field.valueType === "member" ? field.valueType : "text"}::text, 'value', ${value}."textValue")`;
}

export function compileRecordMeasure(
  companyId: string,
  measure: RecordMeasure,
  model: RecordModel,
  access: RecordAccessMap,
  currency: string,
): Prisma.Sql {
  const query = RecordQuerySchema.parse(measure.source);
  const eligible = compileRecordQuery(companyId, query, model, access).matching;
  const field = model.fields.find(
    (candidate) =>
      candidate.id === measure.valueFieldId && candidate.typeId === measure.source.typeId && !candidate.archived,
  );
  if (measure.aggregation !== "count" && (!field || !["currency", "number"].includes(field.valueType)))
    throw new RecordWriteError(CustomErrorCode.recordValueInvalid);
  const joins: Prisma.Sql[] = [];
  let pathReadable = Prisma.sql`TRUE`;
  let group = Prisma.sql`grain`;
  let typeId = measure.source.typeId;
  if (measure.groupBy?.path.length) {
    const path = recordPathJoins(companyId, typeId, measure.groupBy.path, model, access, group, true);
    group = Prisma.sql`group_target`;
    typeId = path.typeId;
    joins.push(Prisma.sql`LEFT JOIN LATERAL (
      SELECT * FROM (
        SELECT reached.*, COUNT(id) OVER () AS "endpointCount", BOOL_OR(blocked) OVER () AS "hasRestricted"
        FROM (
          SELECT DISTINCT ${path.target}.id, ${path.target}."typeId", ${path.restricted} AS blocked
          FROM (SELECT 1) seed ${path.joins}
        ) reached
      ) checked WHERE id IS NOT NULL OR blocked OR ("endpointCount" = 0 AND NOT "hasRestricted")
    ) ${group} ON TRUE`);
    pathReadable = Prisma.sql`NOT COALESCE(${group}.blocked, FALSE)`;
  }
  const groupType = model.types.find((type) => type.id === typeId && !type.archived);
  const systemField = measure.groupBy?.fieldId?.startsWith("system:") ? measure.groupBy.fieldId : null;
  const groupField =
    measure.groupBy && !systemField
      ? model.fields.find(
          (candidate) =>
            candidate.typeId === typeId &&
            candidate.id === (measure.groupBy?.fieldId ?? groupType?.primaryFieldId) &&
            !candidate.archived,
        )
      : undefined;
  if (measure.groupBy && !groupField && !systemField) throw new RecordWriteError(CustomErrorCode.recordValueInvalid);
  const interval = measure.groupBy?.dateInterval;
  if (
    interval &&
    !(systemField
      ? systemField !== "system:assignedTo"
      : groupField && measure.groupBy?.fieldId && ["date", "dateTime"].includes(groupField.valueType))
  )
    throw new RecordWriteError(CustomErrorCode.recordMeasureDateIntervalInvalid);
  const groupByRecord = measure.groupBy?.fieldId === null;
  const groupFilter = measure.groupBy?.filter;
  const groupSelection = hasRecordMeasureGroupFilter(measure)
    ? Prisma.sql`${group}.id IN (${compileRecordQuery(companyId, RecordQuerySchema.parse({ ...groupFilter, typeId, locale: measure.source.locale }), model, access).matching})`
    : Prisma.sql`TRUE`;
  const groupReadable = groupField
    ? Prisma.sql`(${pathReadable} AND ${fieldReadPredicate(companyId, groupField, model, access, group)})`
    : systemField
      ? Prisma.sql`(${pathReadable})`
      : Prisma.sql`TRUE`;
  const groupFailed = groupField ? Prisma.sql`COALESCE(group_value.state = 'error', FALSE)` : Prisma.sql`FALSE`;
  const bucket = (instant: Prisma.Sql) =>
    Prisma.sql`jsonb_build_object('kind', 'date', 'value', to_char(date_trunc(${interval}::text, ${instant}), 'YYYY-MM-DD'))`;
  const zoned = (instant: Prisma.Sql) =>
    Prisma.sql`((${instant} AT TIME ZONE 'UTC') AT TIME ZONE ${measure.groupBy?.timeZone ?? "UTC"}::text)`;
  let groupValue = Prisma.sql`NULL::jsonb`;
  let groupState = Prisma.sql`'missing'`;
  if (groupField?.valueType === "select" && groupField.multiple) {
    groupValue = Prisma.sql`CASE WHEN ${groupReadable} AND group_option.id IS NOT NULL THEN jsonb_build_object('kind', 'select', 'value', group_option.id) ELSE NULL END`;
    groupState = Prisma.sql`CASE WHEN NOT (${groupReadable}) THEN 'restricted' WHEN group_value.state = 'error' THEN 'error' WHEN group_option.id IS NULL THEN 'missing' ELSE 'value' END`;
    joins.push(
      Prisma.sql`LEFT JOIN "RecordValue" group_value ON group_value."companyId" = ${companyId} AND group_value."typeId" = ${typeId} AND group_value."recordId" = ${group}.id AND group_value."fieldId" = ${groupField.id}`,
      Prisma.sql`LEFT JOIN LATERAL unnest(CASE WHEN group_value.state = 'value' THEN group_value."textListValue" ELSE ARRAY[]::text[] END) group_option(id) ON TRUE`,
    );
  } else if (groupField) {
    const scalar =
      interval && groupField.valueType === "date"
        ? bucket(Prisma.sql`group_value."instantValue"`)
        : interval
          ? bucket(zoned(Prisma.sql`group_value."instantValue"`))
          : scalarJson(groupField, Prisma.sql`group_value`);
    groupValue = Prisma.sql`CASE WHEN ${groupReadable} AND group_value.state = 'value' THEN ${scalar} ELSE NULL END`;
    groupState = Prisma.sql`CASE WHEN NOT (${groupReadable}) THEN 'restricted' ELSE COALESCE(group_value.state, 'missing') END`;
    joins.push(
      Prisma.sql`LEFT JOIN "RecordValue" group_value ON group_value."companyId" = ${companyId} AND group_value."typeId" = ${typeId} AND group_value."recordId" = ${group}.id AND group_value."fieldId" = ${groupField.id}`,
    );
  } else if (systemField === "system:assignedTo") {
    groupValue = Prisma.sql`CASE WHEN ${groupReadable} AND group_assignment."userId" IS NOT NULL THEN jsonb_build_object('kind', 'member', 'value', group_assignment."userId") ELSE NULL END`;
    groupState = Prisma.sql`CASE WHEN NOT (${groupReadable}) THEN 'restricted' WHEN group_assignment."userId" IS NULL THEN 'missing' ELSE 'value' END`;
    joins.push(
      Prisma.sql`LEFT JOIN "RecordAssignment" group_assignment ON group_assignment."companyId" = ${companyId} AND group_assignment."typeId" = ${typeId} AND group_assignment."recordId" = ${group}.id`,
    );
  } else if (systemField) {
    const instant = Prisma.sql`group_record.${Prisma.raw(systemField === "system:createdAt" ? '"createdAt"' : '"updatedAt"')}`;
    const scalar = interval
      ? bucket(zoned(instant))
      : Prisma.sql`jsonb_build_object('kind', 'dateTime', 'value', to_char(${instant}, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))`;
    groupValue = Prisma.sql`CASE WHEN ${groupReadable} AND ${instant} IS NOT NULL THEN ${scalar} ELSE NULL END`;
    groupState = Prisma.sql`CASE WHEN NOT (${groupReadable}) THEN 'restricted' WHEN ${instant} IS NULL THEN 'missing' ELSE 'value' END`;
    joins.push(
      Prisma.sql`LEFT JOIN "CrmRecord" group_record ON group_record."companyId" = ${companyId} AND group_record."typeId" = ${typeId} AND group_record.id = ${group}.id`,
    );
  }
  if (field) {
    joins.push(
      Prisma.sql`LEFT JOIN "RecordValue" amount ON amount."companyId" = ${companyId} AND amount."typeId" = ${field.typeId} AND amount."recordId" = grain.id AND amount."fieldId" = ${field.id}`,
    );
  }
  const amountReadable = field
    ? fieldReadPredicate(companyId, field, model, access, Prisma.sql`grain`)
    : Prisma.sql`TRUE`;
  const amountState = Prisma.sql`CASE WHEN NOT (${groupReadable}) THEN 'restricted' WHEN ${groupFailed} THEN 'error' ELSE ${measure.aggregation === "count" ? Prisma.sql`'value'` : Prisma.sql`CASE WHEN NOT (${amountReadable}) THEN 'restricted' ELSE COALESCE(amount.state, 'missing') END`} END`;
  const amountValue = Prisma.sql`CASE WHEN ${groupReadable} AND NOT (${groupFailed}) THEN ${measure.aggregation === "count" ? Prisma.sql`1::numeric` : Prisma.sql`CASE WHEN ${amountReadable} AND amount.state = 'value' THEN amount."decimalValue" ELSE NULL END`} ELSE NULL END`;
  const amountCurrency =
    measure.aggregation === "count"
      ? Prisma.sql`NULL::text`
      : Prisma.sql`CASE WHEN ${amountReadable} AND amount.state = 'value' THEN amount.currency ELSE NULL END`;
  const operators = {
    count: "SUM",
    sum: "SUM",
    average: "AVG",
    min: "MIN",
    max: "MAX",
  } as const;
  const aggregate = Prisma.sql`${Prisma.raw(operators[measure.aggregation])}(value)`;
  return Prisma.sql`WITH eligible AS (${eligible}), contributions AS (
    SELECT DISTINCT grain.id, ${groupByRecord ? Prisma.sql`${group}.id` : Prisma.sql`NULL::text`} AS "groupRecordId", ${groupByRecord ? Prisma.sql`${group}."typeId"` : Prisma.sql`NULL::text`} AS "groupTypeId", ${groupField ? Prisma.sql`${groupField.id}::text` : systemField ? Prisma.sql`${systemField}::text` : Prisma.sql`NULL::text`} AS "groupFieldId",
      ${groupState} AS "groupState", ${groupValue} AS "groupValue", ${amountState} AS state, ${amountValue} AS value, ${amountCurrency} AS currency
    FROM eligible JOIN "CrmRecord" grain ON grain."companyId" = ${companyId} AND grain."typeId" = ${measure.source.typeId} AND grain.id = eligible.id ${joins.length ? Prisma.join(joins, " ") : Prisma.empty}
    WHERE ${groupSelection}
  ) SELECT "groupRecordId", "groupTypeId", "groupFieldId", "groupState", "groupValue", COUNT(*)::integer AS count,
    CASE WHEN BOOL_OR(state = 'restricted') THEN 'restricted' WHEN BOOL_OR(state = 'error') THEN 'error' WHEN COUNT(DISTINCT currency) > 1 THEN 'currency_mismatch' WHEN COUNT(value) = 0 THEN 'missing' ELSE 'value' END AS "resultState",
    ${["sum", "count"].includes(measure.aggregation) ? Prisma.sql`COALESCE(${aggregate}, 0)::text` : Prisma.sql`${aggregate}::text`} AS "resultValue",
    ${field?.valueType === "currency" && measure.aggregation !== "count" ? Prisma.sql`COALESCE(MAX(currency), ${currency.toUpperCase()})` : Prisma.sql`NULL::text`} AS "resultCurrency"
    FROM contributions GROUP BY "groupRecordId", "groupTypeId", "groupFieldId", "groupState", "groupValue" ORDER BY "groupValue"::text NULLS LAST, "groupRecordId" NULLS LAST LIMIT ${measure.groupLimit + 1}`;
}
