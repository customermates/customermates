import type { GroupValueSums } from "@/core/base/base-get.schema";
import type { DateBucket } from "./grouping.schema";
import type { GroupTargetWhere } from "./group-scope";
import type { GroupableFieldSpec } from "./groupable-field";

import { MAX_AXIS_GROUPS, NO_VALUE_GROUP_KEY } from "./grouping.schema";
import { ENTITY_CUSTOM_FIELD_RELATION } from "./groupable-field";
import { orderByOptionIndex } from "./option-order";
import { dateBucketLadder } from "./date-buckets";
import { groupScopeFragment, withFragment } from "./group-scope";

export type GroupCountRow = { key: string; count: number; sums?: GroupValueSums };

export type GroupCountDelegate = {
  count: (args: unknown) => Promise<number>;
  groupBy: (args: unknown) => Promise<Array<Record<string, unknown>>>;
};

export type GroupCountRuntime = {
  delegate: (model: string) => GroupCountDelegate;
  companyId: string;
  targetWhere: GroupTargetWhere;
};

export type GroupCountRequest = {
  spec: GroupableFieldSpec;
  where: Record<string, unknown>;
  bucket?: DateBucket;
  sumFields?: readonly string[];
  now?: string;
};

function rowCount(row: Record<string, unknown>): number {
  return (row._count as { _all: number })._all;
}

function pickNumericSums(
  sums: Record<string, unknown> | undefined,
  fields: readonly string[],
): GroupValueSums | undefined {
  if (!sums || fields.length === 0) return undefined;

  return Object.fromEntries(fields.flatMap((field) => (typeof sums[field] === "number" ? [[field, sums[field]]] : [])));
}

function axisKeys(
  options: readonly { value: string; index?: number }[],
  rows: readonly Record<string, unknown>[],
): string[] {
  const declared = new Map(orderByOptionIndex(options).map((option, position) => [option.value, position]));
  const present = rows.flatMap((row) => (row.value === null ? [] : [{ key: String(row.value), rows: rowCount(row) }]));

  return [
    ...present
      .filter((row) => declared.has(row.key))
      .sort((left, right) => (declared.get(left.key) ?? 0) - (declared.get(right.key) ?? 0)),
    ...present.filter((row) => !declared.has(row.key)).sort((left, right) => right.rows - left.rows),
  ]
    .slice(0, MAX_AXIS_GROUPS + 1)
    .map((row) => row.key);
}

export async function countGroupRows(runtime: GroupCountRuntime, request: GroupCountRequest): Promise<GroupCountRow[]> {
  const { spec, where } = request;
  const noValueScope = () =>
    groupScopeFragment(
      { spec, key: NO_VALUE_GROUP_KEY, bucket: request.bucket, now: request.now },
      runtime.targetWhere,
    );

  const scopedCount = (key: string) =>
    runtime.delegate(spec.model).count({
      where: withFragment(
        where,
        groupScopeFragment({ spec, key, bucket: request.bucket, now: request.now }, runtime.targetWhere),
      ),
    });

  switch (spec.kind) {
    case "customSingleSelect": {
      const [rows, noValue] = await Promise.all([
        runtime.delegate("customFieldValue").groupBy({
          by: ["value"],
          where: {
            companyId: runtime.companyId,
            columnId: spec.columnId,
            entityType: spec.entityType,
            [ENTITY_CUSTOM_FIELD_RELATION[spec.entityType]]: where,
          },
          _count: { _all: true },
        }),
        runtime.delegate(spec.model).count({ where: withFragment(where, noValueScope()) }),
      ]);

      const keys = axisKeys(spec.options, rows);
      const counts = await Promise.all(keys.map((key) => scopedCount(key)));

      return [
        ...keys.map((key, index) => ({ key, count: counts[index] })),
        { key: NO_VALUE_GROUP_KEY, count: noValue },
      ];
    }

    case "enum": {
      const sumFields = request.sumFields ?? [];
      const rows = await runtime.delegate(spec.model).groupBy({
        by: [spec.column],
        where,
        _count: { _all: true },
        ...(sumFields.length > 0 ? { _sum: Object.fromEntries(sumFields.map((field) => [field, true])) } : {}),
      });

      return rows.map((row) => ({
        key: row[spec.column] == null ? NO_VALUE_GROUP_KEY : String(row[spec.column]),
        count: rowCount(row),
        sums: pickNumericSums(row._sum as Record<string, unknown> | undefined, sumFields),
      }));
    }

    case "relation": {
      const [rows, noValue] = await Promise.all([
        runtime.delegate(spec.joinModel).groupBy({
          by: [spec.keyColumn],
          where: {
            companyId: runtime.companyId,
            [spec.parentRelation]: where,
            [spec.targetRelation]: runtime.targetWhere(spec.targetModel),
          },
          _count: { _all: true },
          orderBy: { _count: { [spec.keyColumn]: "desc" } },
          take: MAX_AXIS_GROUPS + 1,
        }),
        runtime.delegate(spec.model).count({ where: withFragment(where, noValueScope()) }),
      ]);

      return [
        ...rows.map((row) => ({ key: String(row[spec.keyColumn]), count: rowCount(row) })),
        ...(noValue > 0 ? [{ key: NO_VALUE_GROUP_KEY, count: noValue }] : []),
      ];
    }

    case "dateBucket": {
      const ladder = dateBucketLadder(request.bucket ?? "month", request.now ? new Date(request.now) : new Date());
      const counts = await Promise.all(ladder.map((entry) => scopedCount(entry.key)));

      return ladder.map((entry, index) => ({ key: entry.key, count: counts[index] }));
    }

    default: {
      const exhaustive: never = spec;
      throw new Error(String(exhaustive));
    }
  }
}
