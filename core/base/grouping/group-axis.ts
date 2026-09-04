import type { DataViewGroup, DateBucket, Grouping } from "./grouping.schema";
import type { GroupCountRow } from "./group-count";
import type { GroupLabel } from "./group-labels";
import type { GroupableFieldSpec } from "./groupable-field";

import { MAX_AXIS_GROUPS, NO_VALUE_GROUP_KEY } from "./grouping.schema";
import { dateBucketLadder } from "./date-buckets";
import { orderByOptionIndex } from "./option-order";

export type ResolvedGrouping = { spec: GroupableFieldSpec; grouping: Grouping };

export type GroupAxis = { groups: DataViewGroup[]; overflow?: { shown: number } };

export type GroupAxisInput = {
  spec: GroupableFieldSpec;
  bucket?: DateBucket;
  now?: string;
  rows: readonly GroupCountRow[];
  labels: Map<string, GroupLabel>;
  collator: Pick<Intl.Collator, "compare">;
};

const DEFAULT_DATE_BUCKET: DateBucket = "month";

export function resolveGrouping(
  grouping: Grouping | undefined,
  specs: readonly GroupableFieldSpec[],
): ResolvedGrouping | undefined {
  if (!grouping) return undefined;

  const spec = specs.find((candidate) => candidate.field === grouping.field);
  if (!spec) return undefined;

  if (spec.kind !== "dateBucket") return { spec, grouping: { field: spec.field } };

  const bucket = grouping.bucket && spec.buckets.includes(grouping.bucket) ? grouping.bucket : DEFAULT_DATE_BUCKET;

  return { spec, grouping: { field: spec.field, bucket } };
}

export function resolveGroupAxis(input: GroupAxisInput): GroupAxis {
  const { spec } = input;
  const countByKey = new Map(input.rows.map((row) => [row.key, row]));

  switch (spec.kind) {
    case "customSingleSelect": {
      const ordered = orderByOptionIndex(spec.options);
      const declared = new Set(ordered.map((option) => option.value));
      const groups = ordered.map((option) =>
        group({
          key: option.value,
          row: countByKey.get(option.value),
          labelKind: "value",
          label: option.label,
          color: option.color,
          weight: option.weight,
        }),
      );

      const unavailable = input.rows
        .filter((row) => row.key !== NO_VALUE_GROUP_KEY && !declared.has(row.key))
        .map((row) => group({ key: row.key, row, labelKind: "unavailable" }));

      return truncate([...groups, ...unavailable], noValueGroup(countByKey.get(NO_VALUE_GROUP_KEY), true));
    }

    case "enum": {
      const groups = spec.values.map((value) =>
        group({
          key: value,
          row: countByKey.get(value),
          labelKind: "value",
          labelKey: spec.valueLabelKey(value),
        }),
      );

      const noValue = spec.nullable ? noValueGroup(countByKey.get(NO_VALUE_GROUP_KEY), true) : undefined;

      return truncate(groups, noValue);
    }

    case "relation": {
      const valueRows = input.rows.filter((row) => row.key !== NO_VALUE_GROUP_KEY);
      const groups = valueRows
        .flatMap((row) => {
          const label = input.labels.get(row.key);

          return label
            ? [group({ key: row.key, row, labelKind: "value", label: label.label, avatarUrl: label.avatarUrl })]
            : [];
        })
        .sort((left, right) => input.collator.compare(left.label ?? "", right.label ?? ""));

      const stored = countByKey.get(NO_VALUE_GROUP_KEY);

      return truncate(groups, stored ? noValueGroup(stored, false) : undefined, valueRows.length > MAX_AXIS_GROUPS);
    }

    case "dateBucket": {
      const ladder = dateBucketLadder(
        input.bucket ?? DEFAULT_DATE_BUCKET,
        input.now ? new Date(input.now) : new Date(),
      );
      const groups = ladder.map((entry) => ({
        ...group({ key: entry.key, row: countByKey.get(entry.key), labelKind: "value" }),
        bucketStart: entry.start?.toISOString(),
        bucketRole: entry.role,
      }));

      return truncate(groups, undefined);
    }

    default: {
      const exhaustive: never = spec;
      throw new Error(String(exhaustive));
    }
  }
}

function group(args: {
  key: string;
  row: GroupCountRow | undefined;
  labelKind: DataViewGroup["labelKind"];
  label?: string;
  labelKey?: string;
  color?: DataViewGroup["color"];
  weight?: number;
  avatarUrl?: string | null;
  isNoValue?: boolean;
}): DataViewGroup {
  return {
    key: args.key,
    count: args.row?.count ?? 0,
    labelKind: args.labelKind,
    ...(args.label === undefined ? {} : { label: args.label }),
    ...(args.labelKey === undefined ? {} : { labelKey: args.labelKey }),
    ...(args.color === undefined ? {} : { color: args.color }),
    ...(args.weight === undefined ? {} : { weight: args.weight }),
    ...(args.avatarUrl === undefined ? {} : { avatarUrl: args.avatarUrl }),
    ...(args.row?.sums === undefined ? {} : { valueSums: args.row.sums }),
    isNoValue: args.isNoValue ?? false,
    materialised: false,
    itemIds: [],
    hasMore: false,
  };
}

function noValueGroup(row: GroupCountRow | undefined, always: boolean): DataViewGroup | undefined {
  if (!always && !row) return undefined;

  return group({ key: NO_VALUE_GROUP_KEY, row, labelKind: "noValue", isNoValue: true });
}

function truncate(groups: DataViewGroup[], noValue: DataViewGroup | undefined, beyondCap = false): GroupAxis {
  const capped = groups.slice(0, MAX_AXIS_GROUPS);
  const truncated = beyondCap || capped.length < groups.length;

  return {
    groups: noValue ? [...capped, noValue] : capped,
    ...(truncated ? { overflow: { shown: capped.length } } : {}),
  };
}
