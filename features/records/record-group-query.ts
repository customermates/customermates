import { Prisma } from "@/generated/prisma";

import type { RecordModel } from "./record-model.schema";
import type { RecordAccessMap, RecordQuery, RecordReadScope } from "./record-query.schema";
import type { RecordGroupingResult } from "./record-grouping.schema";

import { CHIP_COLORS } from "@/constants/chip-colors";
import {
  GROUP_PAGE_SIZE_DEFAULT,
  MAX_AXIS_GROUPS,
  MAX_MATERIALISED_GROUPS,
  NO_VALUE_GROUP_KEY,
} from "@/core/base/grouping/grouping.schema";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordWriteError } from "./record-write.service";
import { compileRecordQuery, fieldReadPredicate, recordReadPredicate } from "./record-query";
import { resolveRecordGrouping } from "./record-grouping";
import { recordCollation } from "./record-collation";
import { recordGroupSummaryCtes } from "./record-group-summary";
import { recordPathJoins } from "./record-path-query";

export type RecordGroupRow = {
  key: string;
  metadata: Omit<RecordGroupingResult["groups"][number], "key" | "count" | "materialised" | "itemIds" | "hasMore">;
  count: number;
  itemIds: string[];
  materialised: boolean;
  total: number;
  membershipTotal: number;
  groupCount: number;
  overflowWithRecords: boolean;
  restricted: boolean;
  summaries: RecordGroupingResult["groups"][number]["summaries"] | null;
};

const ERROR_GROUP_KEY = "__calculation_error__";
const RESTRICTED_GROUP_KEY = "__restricted__";

function optionProbability(option: RecordModel["fields"][number]["options"][number]) {
  const value = option.attributes.find((attribute) => attribute.key === "probability")?.value;
  return value?.kind === "decimal" && value.currency === null && Number.isFinite(Number(value.value))
    ? { weight: Number(value.value) }
    : {};
}

export function compileRecordGroups(
  companyId: string,
  query: RecordQuery,
  model: RecordModel,
  access: RecordAccessMap,
  memberScope: RecordReadScope,
  currency: string,
): Prisma.Sql {
  const resolved = query.grouping && resolveRecordGrouping(query.typeId, query.grouping, model);
  if (!resolved) throw new RecordWriteError(CustomErrorCode.recordValueInvalid);
  const { source, grouping } = resolved;
  const root = Prisma.sql`"record_0"`;
  const value = Prisma.sql`"group_value"`;
  const emptyMetadata = { labelKind: "noValue", isNoValue: true };
  const seeds: Array<{ key: string; metadata: object; position: number }> = [
    { key: NO_VALUE_GROUP_KEY, metadata: emptyMetadata, position: 1000000 },
  ];
  let joins = Prisma.empty;
  let key = Prisma.sql`${NO_VALUE_GROUP_KEY}::text`;
  let metadata = Prisma.sql`NULL::jsonb`;
  let restricted = Prisma.sql`FALSE`;
  let instant = Prisma.sql`NULL::timestamp`;
  let state = Prisma.sql`'value'::text`;
  if (source.kind === "field") {
    const field = source.field;
    joins = Prisma.sql`LEFT JOIN "RecordValue" ${value} ON ${value}."companyId" = ${companyId}
      AND ${value}."typeId" = ${query.typeId} AND ${value}."recordId" = ${root}.id AND ${value}."fieldId" = ${field.id}`;
    restricted = Prisma.sql`NOT (${fieldReadPredicate(companyId, field, model, access, root)})`;
    state = Prisma.sql`COALESCE(${value}.state, 'missing')`;
    if (field.valueType === "select") {
      seeds.push(
        ...field.options.map((option, position) => ({
          key: `value:${option.id}`,
          position,
          metadata: {
            labelKind: "value",
            isNoValue: false,
            label: option.label,
            ...optionProbability(option),
            ...(CHIP_COLORS.some((color) => color === option.color) ? { color: option.color } : {}),
          },
        })),
      );
      key = Prisma.sql`'value:' || ${value}."textValue"`;
    } else if (field.valueType === "boolean") {
      seeds.push(
        ...[true, false].map((value, position) => ({
          key: `value:${value}`,
          position,
          metadata: { labelKind: "value", isNoValue: false, labelKey: value ? "RecordModel.yes" : "RecordModel.no" },
        })),
      );
      key = Prisma.sql`'value:' || ${value}."booleanValue"::text`;
    } else if (field.valueType === "member") key = Prisma.sql`${value}."textValue"`;
    else {
      instant = ["dateRange", "dateTimeRange"].includes(field.valueType)
        ? Prisma.sql`${value}."rangeStart"`
        : Prisma.sql`${value}."instantValue"`;
    }
  } else if (source.kind === "system" && source.field !== "system:assignedTo")
    instant = source.field === "system:createdAt" ? Prisma.sql`${root}."createdAt"` : Prisma.sql`${root}."updatedAt"`;

  if (source.kind === "system" && source.field === "system:assignedTo") {
    joins = Prisma.sql`LEFT JOIN "RecordAssignment" assignment ON assignment."companyId" = ${companyId}
      AND assignment."typeId" = ${query.typeId} AND assignment."recordId" = ${root}.id`;
    key = Prisma.sql`assignment."userId"`;
  }
  if (
    (source.kind === "system" && source.field === "system:assignedTo") ||
    (source.kind === "field" && source.field.valueType === "member")
  ) {
    const visible =
      memberScope.access === "all"
        ? Prisma.sql`TRUE`
        : memberScope.access === "own"
          ? Prisma.sql`member.id = ${memberScope.userId}`
          : Prisma.sql`FALSE`;
    joins = Prisma.sql`${joins} LEFT JOIN "User" member ON member."companyId" = ${companyId} AND member.id = ${key} AND ${visible}`;
    metadata = Prisma.sql`jsonb_strip_nulls(jsonb_build_object('labelKind', CASE WHEN member.id IS NULL THEN 'unavailable' ELSE 'value' END,
      'isNoValue', FALSE, 'label', NULLIF(TRIM(CONCAT_WS(' ', member."firstName", member."lastName")), ''), 'avatarUrl', member."avatarUrl"))`;
  }
  if (source.kind === "relationship") {
    const { relation, direction } = source;
    const outgoing = direction === "outgoing";
    const targetTypeId = outgoing ? relation.targetTypeId : relation.sourceTypeId;
    const target = Prisma.sql`group_target`;
    const targetType = model.types.find((type) => type.id === targetTypeId && !type.archived);
    const title = model.fields.find((field) => field.id === targetType?.primaryFieldId && !field.archived);
    if (!title) throw new RecordWriteError(CustomErrorCode.recordValueInvalid);
    const targetScope = access.get(targetTypeId) ?? { userId: "", access: "none" as const };
    const readable = recordReadPredicate(companyId, targetScope, target);
    const titleReadable = fieldReadPredicate(companyId, title, model, access, target);
    const sourceId = outgoing ? Prisma.sql`link."sourceId"` : Prisma.sql`link."targetId"`;
    const targetId = outgoing ? Prisma.sql`link."targetId"` : Prisma.sql`link."sourceId"`;
    joins = Prisma.sql`LEFT JOIN "RecordLink" link ON link."companyId" = ${companyId} AND link."relationId" = ${relation.id}
      AND link."sourceTypeId" = ${relation.sourceTypeId} AND link."targetTypeId" = ${relation.targetTypeId} AND ${sourceId} = ${root}.id
      LEFT JOIN "CrmRecord" ${target} ON ${target}."companyId" = ${companyId} AND ${target}."typeId" = ${targetTypeId} AND ${target}.id = ${targetId}
      LEFT JOIN "RecordValue" title ON title."companyId" = ${companyId} AND title."typeId" = ${targetTypeId}
        AND title."recordId" = ${target}.id AND title."fieldId" = ${title.id}`;
    key = Prisma.sql`CASE WHEN ${readable} THEN ${target}.id ELSE NULL END`;
    restricted = Prisma.sql`(${target}.id IS NOT NULL AND NOT (${readable}))`;
    metadata = Prisma.sql`jsonb_strip_nulls(jsonb_build_object('isNoValue', FALSE,
      'labelKind', CASE WHEN ${readable} AND ${titleReadable} AND title.state = 'value' THEN 'value' ELSE 'unavailable' END,
      'label', CASE WHEN ${readable} AND ${titleReadable} AND title.state = 'value' THEN title."textValue" ELSE NULL END))`;
  }
  if (source.kind === "relationshipPath") {
    const path = recordPathJoins(companyId, query.typeId, source.path, model, access, root, true);
    const target = Prisma.sql`group_target`;
    const targetType = model.types.find((type) => type.id === path.typeId && !type.archived);
    const title = model.fields.find((field) => field.id === targetType?.primaryFieldId && !field.archived);
    if (!title) throw new RecordWriteError(CustomErrorCode.recordValueInvalid);
    const titleReadable = fieldReadPredicate(companyId, title, model, access, target);
    joins = Prisma.sql`LEFT JOIN LATERAL (
      SELECT * FROM (
        SELECT reached.*, COUNT(id) OVER () AS "endpointCount", BOOL_OR(blocked) OVER () AS restricted
        FROM (
          SELECT DISTINCT ${path.target}.id, ${path.target}."typeId", ${path.restricted} AS blocked
          FROM (SELECT 1) seed ${path.joins}
        ) reached
      ) checked WHERE id IS NOT NULL OR "endpointCount" = 0
    ) ${target} ON TRUE
    LEFT JOIN "RecordValue" title ON title."companyId" = ${companyId} AND title."typeId" = ${path.typeId}
      AND title."recordId" = ${target}.id AND title."fieldId" = ${title.id}`;
    key = Prisma.sql`${target}.id`;
    restricted = Prisma.sql`COALESCE(${target}.restricted, FALSE)`;
    metadata = Prisma.sql`jsonb_strip_nulls(jsonb_build_object('isNoValue', FALSE,
      'labelKind', CASE WHEN ${titleReadable} AND title.state = 'value' THEN 'value' ELSE 'unavailable' END,
      'label', CASE WHEN ${titleReadable} AND title.state = 'value' THEN title."textValue" ELSE NULL END))`;
  }
  const seedSql = Prisma.sql`SELECT key, metadata, position FROM jsonb_to_recordset(${JSON.stringify(seeds)}::jsonb)
    AS preset(key text, metadata jsonb, position integer)`;
  let dateCtes = Prisma.empty;
  let dateSeeds = Prisma.empty;
  if (resolved.kind === "dateBucket") {
    const bucket = grouping.bucket ?? "month";
    const count = bucket === "month" ? 12 : 7;
    const current =
      bucket === "week"
        ? Prisma.sql`date_trunc('week', transaction_timestamp() AT TIME ZONE 'UTC' + INTERVAL '1 day') - INTERVAL '1 day'`
        : Prisma.sql`date_trunc(${bucket}, transaction_timestamp() AT TIME ZONE 'UTC')`;
    const interval =
      bucket === "day"
        ? Prisma.sql`INTERVAL '1 day'`
        : bucket === "week"
          ? Prisma.sql`INTERVAL '1 week'`
          : Prisma.sql`INTERVAL '1 month'`;
    dateCtes = Prisma.sql`date_windows AS (
      SELECT ${bucket} || ':' || to_char(${current} - index * ${interval}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS key,
        index + 1 AS position, ${current} - index * ${interval} AS start,
        ${current} - (index - 1) * ${interval} AS finish, 'window'::text AS role
      FROM generate_series(0, ${count - 1}) index
      UNION ALL SELECT 'later', 0, ${current} + ${interval}, NULL, 'later'
      UNION ALL SELECT 'earlier', ${count + 1}, NULL, ${current} - ${count - 1} * ${interval}, 'earlier'
    ),`;
    dateSeeds = Prisma.sql`UNION ALL SELECT key, jsonb_strip_nulls(jsonb_build_object('labelKind', 'value', 'isNoValue', FALSE,
      'bucketStart', to_char(start, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'bucketRole', role)), position FROM date_windows`;
    key = Prisma.sql`(SELECT bucket.key FROM date_windows bucket WHERE (bucket.start IS NULL OR ${instant} >= bucket.start)
      AND (bucket.finish IS NULL OR ${instant} < bucket.finish) AND ${instant} IS NOT NULL)`;
  }
  const actualKey = Prisma.sql`CASE WHEN ${restricted} THEN ${RESTRICTED_GROUP_KEY}
    WHEN ${state} = 'error' THEN ${ERROR_GROUP_KEY} ELSE COALESCE(${key}, ${NO_VALUE_GROUP_KEY}) END`;
  const page = query.groupPage;
  const collapsed = page?.collapsed?.length
    ? Prisma.sql`axis.key IN (${Prisma.join(page.collapsed)})`
    : Prisma.sql`FALSE`;
  const selected = page?.only ? Prisma.sql`axis.key = ${page.only}` : Prisma.sql`NOT (${collapsed})`;
  const take = Prisma.sql`COALESCE((${JSON.stringify(page?.overrides ?? {})}::jsonb ->> axis.key)::integer, ${page?.perGroup ?? GROUP_PAGE_SIZE_DEFAULT})`;
  return Prisma.sql`WITH ${dateCtes}
    source AS MATERIALIZED (${compileRecordQuery(companyId, query, model, access).ordered}),
    seeds AS (${seedSql} ${dateSeeds}),
    members AS MATERIALIZED (
      SELECT DISTINCT ${root}.id, ${root}."typeId", ${root}.ordinal, ${actualKey} AS key,
        CASE WHEN ${restricted} THEN NULL ELSE ${metadata} END AS metadata, ${restricted} AS restricted
      FROM source ${root} ${joins}
    ),
    counts AS (SELECT key, COUNT(*)::integer AS count, MIN(metadata::text)::jsonb AS metadata FROM members GROUP BY key),
    axis AS (
      SELECT COALESCE(seeds.key, counts.key) AS key, COALESCE(counts.count, 0) AS count,
        COALESCE(seeds.metadata, counts.metadata, '{"labelKind":"unavailable","isNoValue":false}'::jsonb) AS metadata,
        COALESCE(seeds.position, 0) AS position
      FROM seeds FULL OUTER JOIN counts ON counts.key = seeds.key
    ),
    requested AS (
      SELECT axis.*, ${take} AS take,
        ${selected} AND COUNT(*) FILTER (WHERE ${selected}) OVER (ORDER BY position, metadata->>'label' COLLATE ${recordCollation(query.locale)}, key) <= ${MAX_MATERIALISED_GROUPS} AS materialised
      FROM axis
    ),
    page_axis AS (SELECT * FROM requested ORDER BY position, metadata->>'label' COLLATE ${recordCollation(query.locale)}, key LIMIT ${MAX_AXIS_GROUPS + 2}),
    ${recordGroupSummaryCtes(companyId, query.typeId, query.groupSummaries ?? [], model, access, currency)}
    ranked AS (
      SELECT members.key, members.id, ROW_NUMBER() OVER (PARTITION BY members.key ORDER BY members.ordinal) AS position
      FROM members JOIN page_axis ON page_axis.key = members.key WHERE page_axis.materialised
    ),
    page_ids AS (
      SELECT ranked.key, array_agg(ranked.id ORDER BY ranked.position) AS ids
      FROM ranked JOIN page_axis ON page_axis.key = ranked.key WHERE ranked.position <= page_axis.take GROUP BY ranked.key
    )
    SELECT page_axis.key, page_axis.metadata, page_axis.count, COALESCE(page_ids.ids, ARRAY[]::text[]) AS "itemIds",
      ${query.groupSummaries?.length ? Prisma.sql`(SELECT summaries FROM summary_groups WHERE summary_groups.key = page_axis.key)` : Prisma.sql`NULL::jsonb`} AS summaries,
      page_axis.materialised, (SELECT COUNT(*)::integer FROM source) AS total,
      (SELECT COUNT(*)::integer FROM members) AS "membershipTotal",
      (SELECT COUNT(*)::integer FROM axis WHERE key <> ${NO_VALUE_GROUP_KEY}) AS "groupCount",
      COALESCE((SELECT BOOL_OR(ranked.count > 0) FROM (
        SELECT axis.count, ROW_NUMBER() OVER (ORDER BY position, metadata->>'label' COLLATE ${recordCollation(query.locale)}, key) AS ordinal
        FROM axis WHERE key <> ${NO_VALUE_GROUP_KEY}
      ) ranked WHERE ranked.ordinal > ${MAX_AXIS_GROUPS}), FALSE) AS "overflowWithRecords",
      COALESCE((SELECT BOOL_OR(restricted) FROM members), FALSE) AS restricted
    FROM page_axis LEFT JOIN page_ids ON page_ids.key = page_axis.key
    ORDER BY page_axis.position, page_axis.metadata->>'label' COLLATE ${recordCollation(query.locale)}, page_axis.key`;
}
