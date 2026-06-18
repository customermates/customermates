import type { Filter } from "@/core/base/base-get.schema";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";

import type { ActivityKind } from "./activities.schema";
import { ACTIVITY_KINDS } from "./activities.schema";

export type ActivityQuery = {
  kindsIn?: Set<ActivityKind>;
  kindsNotIn?: Set<ActivityKind>;
  providers?: Set<string>;
  threadIdsIn?: Set<string>;
  threadIdsNotIn?: Set<string>;
};

const FIELD_KIND: string = FilterFieldKey.timelineKind;
const FIELD_PROVIDER: string = FilterFieldKey.provider;
const FIELD_THREAD: string = FilterFieldKey.timelineThreadId;

const TYPE_TO_KINDS: Record<string, readonly ActivityKind[]> = {
  changes: ["audit"],
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

export function interpretFilters(filters: Filter[] | undefined): ActivityQuery {
  const query: ActivityQuery = {};

  for (const filter of filters ?? []) {
    if (filter.field === FIELD_KIND) {
      if (filter.operator === FilterOperatorKey.in) {
        const kinds = resolveKinds(filter.value);
        if (kinds.length) query.kindsIn = new Set(kinds);
      } else if (filter.operator === FilterOperatorKey.notIn) {
        const kinds = resolveKinds(filter.value);
        if (kinds.length) query.kindsNotIn = new Set(kinds);
      }
    } else if (filter.field === FIELD_PROVIDER && filter.operator === FilterOperatorKey.in) {
      if (filter.value.length) query.providers = new Set(filter.value);
    } else if (filter.field === FIELD_THREAD) {
      if (filter.operator === FilterOperatorKey.in && filter.value.length) query.threadIdsIn = new Set(filter.value);
      else if (filter.operator === FilterOperatorKey.notIn && filter.value.length)
        query.threadIdsNotIn = new Set(filter.value);
    }
  }

  return query;
}
