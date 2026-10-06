import type { Filter } from "@/core/base/base-get.schema";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";

import type { ActivityKind } from "./activities.schema";
import { ACTIVITY_KINDS } from "./activities.schema";

export type ActivityQuery = {
  kindsIn?: Set<ActivityKind>;
  kindsNotIn?: Set<ActivityKind>;
};

const TYPE_TO_KINDS: Record<string, readonly ActivityKind[]> = {
  messages: ["message"],
  activities: ["activity", "calendar_event"],
};

function resolveKinds(values: string[]): ActivityKind[] {
  const kinds = new Set<ActivityKind>();
  for (const value of values) {
    const mapped = TYPE_TO_KINDS[value];
    if (mapped) mapped.forEach((kind) => kinds.add(kind));
    else {
      const kind = ACTIVITY_KINDS.find((kind) => kind === value);
      if (kind) kinds.add(kind);
    }
  }
  return [...kinds];
}

function intersect<T>(current: Set<T> | undefined, next: Set<T>): Set<T> {
  if (!current) return next;

  return new Set([...current].filter((value) => next.has(value)));
}

function union<T>(current: Set<T> | undefined, next: Set<T>): Set<T> {
  return new Set([...(current ?? []), ...next]);
}

export function interpretFilters(filters: Filter[] | undefined): ActivityQuery {
  const query: ActivityQuery = {};

  for (const filter of filters ?? []) {
    if ((filter.field as FilterFieldKey) !== FilterFieldKey.timelineKind) continue;
    const values = "value" in filter && Array.isArray(filter.value) ? filter.value : [];
    if (filter.operator === FilterOperatorKey.in) {
      if (values.length) query.kindsIn = intersect(query.kindsIn, new Set(resolveKinds(values)));
    } else if (filter.operator === FilterOperatorKey.notIn && values.length)
      query.kindsNotIn = union(query.kindsNotIn, new Set(resolveKinds(values)));
  }

  return query;
}
