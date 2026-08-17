import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { EntityType } from "@/generated/prisma";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const ACTIVITY_SCOPE_MAX_IDS_PER_TYPE = 50;

export const ACTIVITY_SCOPE_CONTACT_MAX = 500;

export const ACTIVITY_MAX_PAGE = 40;

export const ActivityScopeRecordsSchema = z
  .object({
    entityType: z.enum(EntityType),
    ids: z.array(z.uuid()).min(1).max(ACTIVITY_SCOPE_MAX_IDS_PER_TYPE),
  })
  .strict();

const ActivityScopeEntityTypesSchema = z.array(z.enum(EntityType)).max(Object.keys(EntityType).length);
export const ActivityScopeRecordGroupsSchema = z.array(ActivityScopeRecordsSchema).max(Object.keys(EntityType).length);

export const ActivityScopeSchema = z
  .union([
    z
      .object({
        entityTypes: ActivityScopeEntityTypesSchema.min(1),
        records: ActivityScopeRecordGroupsSchema.optional(),
      })
      .strict(),
    z
      .object({
        entityTypes: ActivityScopeEntityTypesSchema.optional(),
        records: ActivityScopeRecordGroupsSchema.min(1),
      })
      .strict(),
  ])
  .overwrite((scope) => {
    const idsByType = new Map<EntityType, Set<string>>();
    for (const record of scope.records ?? []) {
      const ids = idsByType.get(record.entityType) ?? new Set<string>();
      record.ids.forEach((id) => ids.add(id));
      idsByType.set(record.entityType, ids);
    }

    const records = [...idsByType].map(([entityType, ids]) => ({
      entityType,
      ids: [...ids],
    }));
    const narrowedTypes = new Set(idsByType.keys());
    const entityTypes = [...new Set(scope.entityTypes ?? [])].filter((entityType) => !narrowedTypes.has(entityType));

    if (entityTypes.length) return { entityTypes, ...(records.length ? { records } : {}) };

    return { records };
  })
  .refine((scope) => scope.records?.every(({ ids }) => ids.length <= ACTIVITY_SCOPE_MAX_IDS_PER_TYPE) ?? true, {
    params: { error: CustomErrorCode.activityScopeTooManyIds },
    path: ["records"],
  });

export type ActivityScope = Data<typeof ActivityScopeSchema>;

export function activityScopeForRecord(entityType: EntityType, entityId: string): ActivityScope {
  return { records: [{ entityType, ids: [entityId] }] };
}

export function singleRecordScope(scope: ActivityScope | undefined): {
  entityType?: EntityType;
  entityId?: string;
} {
  const records = scope?.records ?? [];
  if (records.length !== 1 || records[0].ids.length !== 1) return {};

  return { entityType: records[0].entityType, entityId: records[0].ids[0] };
}
