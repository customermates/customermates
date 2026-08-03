import type { Filter } from "@/core/base/base-get.schema";
import type { MessagingProvider } from "@/generated/prisma";

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
  connectedAccountIdsIn?: Set<string>;
  connectedAccountIdsNotIn?: Set<string>;
};

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
    const field = filter.field as FilterFieldKey;

    if (field === FilterFieldKey.timelineKind) {
      if (filter.operator === FilterOperatorKey.in) {
        const kinds = resolveKinds(filter.value);
        if (kinds.length) query.kindsIn = new Set(kinds);
      } else if (filter.operator === FilterOperatorKey.notIn) {
        const kinds = resolveKinds(filter.value);
        if (kinds.length) query.kindsNotIn = new Set(kinds);
      }
    } else if (field === FilterFieldKey.provider && filter.operator === FilterOperatorKey.in) {
      if (filter.value.length) query.providers = new Set(filter.value);
    } else if (field === FilterFieldKey.timelineThreadId) {
      if (filter.operator === FilterOperatorKey.in && filter.value.length) query.threadIdsIn = new Set(filter.value);
      else if (filter.operator === FilterOperatorKey.notIn && filter.value.length)
        query.threadIdsNotIn = new Set(filter.value);
    } else if (field === FilterFieldKey.connectedAccountId) {
      if (filter.operator === FilterOperatorKey.in && filter.value.length)
        query.connectedAccountIdsIn = new Set(filter.value);
      else if (filter.operator === FilterOperatorKey.notIn && filter.value.length)
        query.connectedAccountIdsNotIn = new Set(filter.value);
    }
  }

  return query;
}

export function channelWhere(query: ActivityQuery) {
  const { connectedAccountIdsIn, connectedAccountIdsNotIn } = query;
  if (!connectedAccountIdsIn?.size && !connectedAccountIdsNotIn?.size) return {};

  return {
    connectedAccountId: {
      ...(connectedAccountIdsIn?.size ? { in: [...connectedAccountIdsIn] } : {}),
      ...(connectedAccountIdsNotIn?.size ? { notIn: [...connectedAccountIdsNotIn] } : {}),
    },
  };
}

export function providerWhere(query: ActivityQuery) {
  if (!query.providers?.size) return {};

  return { provider: { in: [...query.providers] as MessagingProvider[] } };
}

export function providerRelationWhere(query: ActivityQuery) {
  if (!query.providers?.size) return {};

  return { connectedAccount: { provider: { in: [...query.providers] as MessagingProvider[] } } };
}

export function threadWhere(query: ActivityQuery) {
  const { threadIdsIn, threadIdsNotIn } = query;
  if (!threadIdsIn?.size && !threadIdsNotIn?.size) return {};

  return {
    messagingThreadId: {
      ...(threadIdsIn?.size ? { in: [...threadIdsIn] } : {}),
      ...(threadIdsNotIn?.size ? { notIn: [...threadIdsNotIn] } : {}),
    },
  };
}
