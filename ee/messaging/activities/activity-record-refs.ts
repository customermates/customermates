import type { EntityType } from "@/generated/prisma";

export const ACTIVITY_RELATED_RECORD_LIMIT = 3;

export type ActivityRecordRef = {
  entityType: EntityType;
  id: string;
  label: string;
  avatarUrl?: string | null;
};

export type ActivityRecordContext = {
  primary: ActivityRecordRef | null;
  related: ActivityRecordRef[];
  relatedOverflow: number;
};

export type ActivityRecordRefKey = `${EntityType}:${string}`;

export const EMPTY_RECORD_CONTEXT: ActivityRecordContext = { primary: null, related: [], relatedOverflow: 0 };

export function recordRefKey(entityType: EntityType, id: string): ActivityRecordRefKey {
  return `${entityType}:${id}`;
}

export function buildRecordContext(
  refs: readonly ActivityRecordRef[],
  limit: number = ACTIVITY_RELATED_RECORD_LIMIT,
): ActivityRecordContext {
  const seen = new Set<ActivityRecordRefKey>();
  const unique: ActivityRecordRef[] = [];

  for (const ref of refs) {
    const key = recordRefKey(ref.entityType, ref.id);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(ref);
  }

  if (unique.length === 0) return EMPTY_RECORD_CONTEXT;

  const [primary, ...rest] = unique;

  return {
    primary,
    related: rest.slice(0, limit),
    relatedOverflow: Math.max(0, rest.length - limit),
  };
}

export function contextRefs(context: ActivityRecordContext): ActivityRecordRef[] {
  return context.primary ? [context.primary, ...context.related] : context.related;
}
