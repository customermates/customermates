import type { EntityType } from "@/generated/prisma";

import { changedFieldsOf, entityTypeForEvent, threadIdOf } from "./routine-event-filter";

export const ROUTINE_TRIGGER_FIELD_LIMIT = 24;

export type RoutineRunTriggerContext = {
  entityType: EntityType | null;
  threadId: string | null;
  changedFields: string[];
  changedFieldsTruncated: boolean;
};

export function routineRunTriggerContext(
  triggerEvent: string | null,
  triggerPayload: unknown,
): RoutineRunTriggerContext | null {
  if (!triggerEvent) return null;

  const changed = changedFieldsOf(triggerPayload);

  return {
    entityType: entityTypeForEvent(triggerEvent),
    threadId: threadIdOf(triggerPayload),
    changedFields: changed.slice(0, ROUTINE_TRIGGER_FIELD_LIMIT),
    changedFieldsTruncated: changed.length > ROUTINE_TRIGGER_FIELD_LIMIT,
  };
}
