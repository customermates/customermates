import { changedFieldsOf, threadIdOf } from "./routine-event-filter";
import { routineRecordReference } from "./routine-record-reference";
import type { RecordRef } from "@/features/records/record-model.schema";

export const ROUTINE_TRIGGER_FIELD_LIMIT = 24;

export type RoutineRunTriggerContext = {
  threadId: string | null;
  changedFields: string[];
  changedFieldsTruncated: boolean;
  recordRef?: RecordRef;
};

export function routineRunTriggerContext(
  triggerEvent: string | null,
  triggerPayload: unknown,
): RoutineRunTriggerContext | null {
  if (!triggerEvent) return null;

  const changed = changedFieldsOf(triggerPayload);
  const ref = routineRecordReference(triggerPayload);

  return {
    ...(ref ? { recordRef: ref } : {}),
    threadId: threadIdOf(triggerPayload),
    changedFields: changed.slice(0, ROUTINE_TRIGGER_FIELD_LIMIT),
    changedFieldsTruncated: changed.length > ROUTINE_TRIGGER_FIELD_LIMIT,
  };
}
