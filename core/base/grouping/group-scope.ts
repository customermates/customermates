import type { DateBucket } from "./grouping.schema";
import type { GroupableFieldSpec, GroupingTargetModel } from "./groupable-field";

import { DEFAULT_DATE_BUCKET, NO_VALUE_GROUP_KEY } from "./grouping.schema";
import { dateBucketEntry } from "./date-buckets";

export type GroupTargetWhere = (model: GroupingTargetModel) => Record<string, unknown>;

export type GroupScope = {
  spec: GroupableFieldSpec;
  key: string;
  bucket?: DateBucket;
  now?: string;
};

const MATCHES_NOTHING = { id: { in: [] as string[] } };

export function withFragment<W extends Record<string, unknown>>(where: W, fragment: unknown): W {
  const existing = Array.isArray(where.AND) ? where.AND : where.AND === undefined ? [] : [where.AND];

  return { ...where, AND: [...existing, fragment] } as W;
}

export function groupScopeFragment(scope: GroupScope, targetWhere: GroupTargetWhere): Record<string, unknown> {
  const { spec, key } = scope;
  const isNoValue = key === NO_VALUE_GROUP_KEY;

  switch (spec.kind) {
    case "customSingleSelect":
      return isNoValue
        ? { customFieldValues: { none: { AND: [{ columnId: spec.columnId }, { value: { not: null } }] } } }
        : { customFieldValues: { some: { AND: [{ columnId: spec.columnId }, { value: { in: [key] } }] } } };

    case "enum":
      if (isNoValue) return { [spec.column]: null };

      return spec.values.includes(key) ? { [spec.column]: key } : MATCHES_NOTHING;

    case "relation": {
      const target = { [spec.targetRelation]: targetWhere(spec.targetModel) };

      return isNoValue
        ? { [spec.collection]: { none: target } }
        : { [spec.collection]: { some: { [spec.keyColumn]: key, ...target } } };
    }

    case "dateBucket": {
      const entry = dateBucketEntry(
        key,
        scope.bucket ?? DEFAULT_DATE_BUCKET,
        scope.now ? new Date(scope.now) : new Date(),
      );
      if (!entry) return MATCHES_NOTHING;

      const range = {
        ...(entry.start ? { gte: entry.start } : {}),
        ...(entry.end ? { lt: entry.end } : {}),
      };

      return { [spec.column]: range };
    }

    default: {
      const exhaustive: never = spec;
      throw new Error(String(exhaustive));
    }
  }
}
