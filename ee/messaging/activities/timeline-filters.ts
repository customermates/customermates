import type { Filter } from "@/core/base/base-get.schema";
import { EntityType, type MessagingProvider } from "@/generated/prisma";

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
  relationshipRules: ActivityRelationshipRule[];
};

export type ActivityRelationshipRule = {
  entityType: EntityType;
  operator: FilterOperatorKey.in | FilterOperatorKey.notIn | FilterOperatorKey.hasSome | FilterOperatorKey.hasNone;
  ids?: string[];
};

const RELATIONSHIP_ENTITY_TYPE: Partial<Record<FilterFieldKey, EntityType>> = {
  [FilterFieldKey.contactIds]: EntityType.contact,
  [FilterFieldKey.organizationIds]: EntityType.organization,
  [FilterFieldKey.dealIds]: EntityType.deal,
  [FilterFieldKey.serviceIds]: EntityType.service,
  [FilterFieldKey.taskIds]: EntityType.task,
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

function intersect<T>(current: Set<T> | undefined, next: Set<T>): Set<T> {
  if (!current) return next;

  return new Set([...current].filter((value) => next.has(value)));
}

function union<T>(current: Set<T> | undefined, next: Set<T>): Set<T> {
  return new Set([...(current ?? []), ...next]);
}

export function interpretFilters(filters: Filter[] | undefined): ActivityQuery {
  const query: ActivityQuery = { relationshipRules: [] };

  for (const filter of filters ?? []) {
    const field = filter.field as FilterFieldKey;
    const values = "value" in filter && Array.isArray(filter.value) ? filter.value : [];

    const relationshipEntityType = RELATIONSHIP_ENTITY_TYPE[field];
    if (relationshipEntityType) {
      if (filter.operator === FilterOperatorKey.hasSome || filter.operator === FilterOperatorKey.hasNone) {
        query.relationshipRules.push({
          entityType: relationshipEntityType,
          operator: filter.operator,
        });
      } else if (
        (filter.operator === FilterOperatorKey.in || filter.operator === FilterOperatorKey.notIn) &&
        values.length
      ) {
        query.relationshipRules.push({
          entityType: relationshipEntityType,
          operator: filter.operator,
          ids: values,
        });
      }
    } else if (field === FilterFieldKey.timelineKind) {
      if (filter.operator === FilterOperatorKey.in) {
        if (values.length) query.kindsIn = intersect(query.kindsIn, new Set(resolveKinds(values)));
      } else if (filter.operator === FilterOperatorKey.notIn && values.length)
        query.kindsNotIn = union(query.kindsNotIn, new Set(resolveKinds(values)));
    } else if (field === FilterFieldKey.provider && filter.operator === FilterOperatorKey.in) {
      if (values.length) query.providers = intersect(query.providers, new Set(values));
    } else if (field === FilterFieldKey.timelineThreadId) {
      if (filter.operator === FilterOperatorKey.in && values.length)
        query.threadIdsIn = intersect(query.threadIdsIn, new Set(values));
      else if (filter.operator === FilterOperatorKey.notIn && values.length)
        query.threadIdsNotIn = union(query.threadIdsNotIn, new Set(values));
    } else if (field === FilterFieldKey.connectedAccountId) {
      if (filter.operator === FilterOperatorKey.in && values.length)
        query.connectedAccountIdsIn = intersect(query.connectedAccountIdsIn, new Set(values));
      else if (filter.operator === FilterOperatorKey.notIn && values.length)
        query.connectedAccountIdsNotIn = union(query.connectedAccountIdsNotIn, new Set(values));
    }
  }

  return query;
}

export function channelWhere(query: ActivityQuery) {
  const { connectedAccountIdsIn, connectedAccountIdsNotIn } = query;
  if (connectedAccountIdsIn === undefined && !connectedAccountIdsNotIn?.size) return {};

  return {
    connectedAccountId: {
      ...(connectedAccountIdsIn !== undefined ? { in: [...connectedAccountIdsIn] } : {}),
      ...(connectedAccountIdsNotIn?.size ? { notIn: [...connectedAccountIdsNotIn] } : {}),
    },
  };
}

export function providerWhere(query: ActivityQuery) {
  if (query.providers === undefined) return {};

  return { provider: { in: [...query.providers] as MessagingProvider[] } };
}

export function providerRelationWhere(query: ActivityQuery) {
  if (query.providers === undefined) return {};

  return {
    connectedAccount: {
      provider: { in: [...query.providers] as MessagingProvider[] },
    },
  };
}

export function threadWhere(query: ActivityQuery) {
  const { threadIdsIn, threadIdsNotIn } = query;
  if (threadIdsIn === undefined && !threadIdsNotIn?.size) return {};

  return {
    messagingThreadId: {
      ...(threadIdsIn !== undefined ? { in: [...threadIdsIn] } : {}),
      ...(threadIdsNotIn?.size ? { notIn: [...threadIdsNotIn] } : {}),
    },
  };
}
