import type { FilterableField } from "@/core/base/base-get.schema";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { Action, EntityType, Resource } from "@/generated/prisma";
import { TERMINOLOGY_ENTITY_RESOURCE } from "@/features/entity-terminology/entity-terminology.constants";

export const ACTIVITY_FILTER_FIELD_BY_ENTITY_TYPE: Record<EntityType, FilterFieldKey> = {
  [EntityType.contact]: FilterFieldKey.contactIds,
  [EntityType.organization]: FilterFieldKey.organizationIds,
  [EntityType.deal]: FilterFieldKey.dealIds,
  [EntityType.service]: FilterFieldKey.serviceIds,
  [EntityType.task]: FilterFieldKey.taskIds,
};

const ACTIVITY_ENTITY_TYPE_BY_FILTER_FIELD = new Map(
  Object.entries(ACTIVITY_FILTER_FIELD_BY_ENTITY_TYPE).map(([entityType, field]) => [field, entityType as EntityType]),
);

export function activityEntityTypeForFilterField(field: string): EntityType | undefined {
  return ACTIVITY_ENTITY_TYPE_BY_FILTER_FIELD.get(field as FilterFieldKey);
}

export function activityFilterableFieldsFor(args: {
  canReadAudit: boolean;
  canReadMessages: boolean;
  readableEntityTypes: EntityType[];
}): FilterableField[] {
  const relationshipFields: FilterableField[] = args.readableEntityTypes.map((entityType) => {
    const field = ACTIVITY_FILTER_FIELD_BY_ENTITY_TYPE[entityType];
    return { field, operators: FILTER_FIELD_DEFAULT_OPERATORS[field] };
  });
  const sourceFields: FilterableField[] = [
    {
      field: FilterFieldKey.timelineKind,
      operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.timelineKind],
    },
    {
      field: FilterFieldKey.timelineThreadId,
      operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.timelineThreadId],
    },
    { field: FilterFieldKey.provider, operators: [FilterOperatorKey.in] },
    {
      field: FilterFieldKey.connectedAccountId,
      operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.connectedAccountId],
    },
  ];

  if (args.canReadMessages) return [...relationshipFields, ...sourceFields];
  if (args.canReadAudit) {
    return [
      ...relationshipFields,
      ...sourceFields.filter((field) => field.field === FilterFieldKey.timelineKind.toString()),
    ];
  }
  return [];
}

export function activityFilterableFieldsForViewer(viewer: {
  canAccess: (resource: Resource) => boolean;
  canReadMessages: boolean;
  hasPermission: (resource: Resource, action: Action) => boolean;
}): FilterableField[] {
  return activityFilterableFieldsFor({
    canReadAudit: viewer.hasPermission(Resource.auditLog, Action.readAll),
    canReadMessages: viewer.canReadMessages,
    readableEntityTypes: Object.values(EntityType).filter((entityType) =>
      viewer.canAccess(TERMINOLOGY_ENTITY_RESOURCE[entityType]),
    ),
  });
}

export function activityFilterableFieldsRetainedForFailClosedCompilation(): FilterableField[] {
  return activityFilterableFieldsFor({
    canReadAudit: true,
    canReadMessages: true,
    readableEntityTypes: Object.values(EntityType),
  });
}
